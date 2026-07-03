import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, clearTestDB, createSuperAdmin, createRestrictedUser, authHeader } from '../testUtils/setup';
import { Lead } from '../../models/Lead';
import { LeadProposal } from '../../models/LeadProposal';
import { Package } from '../../models/Package';
import { LeadMasterData } from '../../models/LeadMasterData';

test('super-admin lead endpoints', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('rejects requests with no auth token', async () => {
    const res = await request(app).get('/api/v1/super-admin/leads');
    assert.equal(res.status, 401);
  });

  await t.test('rejects a non-super-admin role', async () => {
    const { token } = await createRestrictedUser([]);
    const res = await request(app)
      .get('/api/v1/super-admin/leads')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 403);
  });

  await t.test('creates a lead', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/leads')
      .set('Authorization', authHeader(token))
      .send({ companyName: 'Acme Inc', contactName: 'John Smith', contactEmail: 'john@acme.test' });

    assert.equal(res.status, 201);
    assert.equal(res.body.companyName, 'Acme Inc');
    assert.equal(res.body.stage, 'LEAD');
    assert.equal(res.body.stageHistory.length, 1);
  });

  await t.test('rejects creating a lead with an invalid email', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/leads')
      .set('Authorization', authHeader(token))
      .send({ companyName: 'Acme Inc', contactName: 'John Smith', contactEmail: 'not-an-email' });
    assert.equal(res.status, 400);
  });

  await t.test('lists leads with pagination', async () => {
    const { token } = await createSuperAdmin();
    await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test' }).save();

    const res = await request(app)
      .get('/api/v1/super-admin/leads')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.pagination.total, 1);
  });

  await t.test('filters leads by stage', async () => {
    const { token } = await createSuperAdmin();
    await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test', stage: 'WON' }).save();
    await new Lead({ companyName: 'Beta', contactName: 'Jane', contactEmail: 'jane@beta.test', stage: 'LEAD' }).save();

    const res = await request(app)
      .get('/api/v1/super-admin/leads')
      .query({ stage: 'WON' })
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].companyName, 'Acme');
  });

  await t.test('defaults temperature to NEW and accepts a custom source string', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/leads')
      .set('Authorization', authHeader(token))
      .send({ companyName: 'Acme Inc', contactName: 'John Smith', contactEmail: 'john@acme.test', source: 'LinkedIn Ads' });

    assert.equal(res.status, 201);
    assert.equal(res.body.temperature, 'NEW');
    assert.equal(res.body.source, 'LinkedIn Ads');
  });

  await t.test('filters leads by temperature', async () => {
    const { token } = await createSuperAdmin();
    await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test', temperature: 'HOT' }).save();
    await new Lead({ companyName: 'Beta', contactName: 'Jane', contactEmail: 'jane@beta.test', temperature: 'COLD' }).save();

    const res = await request(app)
      .get('/api/v1/super-admin/leads')
      .query({ temperature: 'HOT' })
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].companyName, 'Acme');
  });

  await t.test('returns the pipeline summary', async () => {
    const { token } = await createSuperAdmin();
    await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test', stage: 'LEAD', estimatedValue: 1000 }).save();

    const res = await request(app)
      .get('/api/v1/super-admin/leads/pipeline-summary')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.summary.length, 6);
    const leadStage = res.body.summary.find((s: any) => s.stage === 'LEAD');
    assert.equal(leadStage.count, 1);
    assert.equal(leadStage.value, 1000);
    assert.equal(res.body.avgDaysToWin, 0);
  });

  await t.test('computes avgDaysToWin from the WON stageHistory entry', async () => {
    const { token } = await createSuperAdmin();
    const lead = await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test', stage: 'LEAD' }).save();
    // Backdate createdAt to 5 days before the WON stage change, bypassing mongoose's
    // automatic timestamp on save (Lead isn't tenant-isolation scoped).
    await Lead.collection.updateOne({ _id: lead._id }, { $set: { createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) } });
    await request(app)
      .put(`/api/v1/super-admin/leads/${lead._id}`)
      .set('Authorization', authHeader(token))
      .send({ stage: 'WON' });

    const res = await request(app)
      .get('/api/v1/super-admin/leads/pipeline-summary')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.ok(res.body.avgDaysToWin >= 4.9 && res.body.avgDaysToWin <= 5.1, `expected ~5, got ${res.body.avgDaysToWin}`);
  });

  await t.test('gets a lead by id with its proposals', async () => {
    const { token } = await createSuperAdmin();
    const lead = await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test' }).save();

    const res = await request(app)
      .get(`/api/v1/super-admin/leads/${lead._id}`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.companyName, 'Acme');
    assert.deepEqual(res.body.proposals, []);
  });

  await t.test('returns 404 for a non-existent lead', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .get('/api/v1/super-admin/leads/507f1f77bcf86cd799439099')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 404);
  });

  await t.test('updates a lead and records stage history when the stage changes', async () => {
    const { token } = await createSuperAdmin();
    const lead = await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test', stage: 'LEAD' }).save();

    const res = await request(app)
      .put(`/api/v1/super-admin/leads/${lead._id}`)
      .set('Authorization', authHeader(token))
      .send({ stage: 'DEMO_SCHEDULED' });

    assert.equal(res.status, 200);
    assert.equal(res.body.stage, 'DEMO_SCHEDULED');
    assert.equal(res.body.stageHistory.length, 1);
    assert.equal(res.body.stageHistory[0].toStage, 'DEMO_SCHEDULED');
  });

  await t.test('returns 404 when updating a non-existent lead', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .put('/api/v1/super-admin/leads/507f1f77bcf86cd799439099')
      .set('Authorization', authHeader(token))
      .send({ stage: 'WON' });
    assert.equal(res.status, 404);
  });

  await t.test('deletes a lead', async () => {
    const { token } = await createSuperAdmin();
    const lead = await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test' }).save();

    const res = await request(app)
      .delete(`/api/v1/super-admin/leads/${lead._id}`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    const remaining = await Lead.findById(lead._id);
    assert.equal(remaining, null);
  });

  await t.test('returns 404 when deleting a non-existent lead', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .delete('/api/v1/super-admin/leads/507f1f77bcf86cd799439099')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 404);
  });

  await t.test('adds a conversation note to a lead', async () => {
    const { token } = await createSuperAdmin();
    const lead = await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test' }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/leads/${lead._id}/notes`)
      .set('Authorization', authHeader(token))
      .send({ note: 'Called, interested in the Pro plan' });

    assert.equal(res.status, 201);
    assert.equal(res.body.activityLog.length, 1);
    assert.equal(res.body.activityLog[0].note, 'Called, interested in the Pro plan');

    const detail = await request(app)
      .get(`/api/v1/super-admin/leads/${lead._id}`)
      .set('Authorization', authHeader(token));
    assert.equal(detail.body.activityLog[0].note, 'Called, interested in the Pro plan');
  });

  await t.test('rejects an empty note', async () => {
    const { token } = await createSuperAdmin();
    const lead = await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test' }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/leads/${lead._id}/notes`)
      .set('Authorization', authHeader(token))
      .send({ note: '' });

    assert.equal(res.status, 400);
  });

  await t.test('returns 404 adding a note to a non-existent lead', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/leads/507f1f77bcf86cd799439099/notes')
      .set('Authorization', authHeader(token))
      .send({ note: 'Hello' });
    assert.equal(res.status, 404);
  });

  // ---- Lead proposals ----
  // generateLeadProposal calls buildProposalPdf -> savePdfToCloudinary, which performs a real
  // upload against whatever Cloudinary account is configured in the environment (this repo's
  // .env has live Cloudinary credentials that get injected into the test process). We don't
  // want automated tests doing real uploads to a live external account, so we only exercise
  // the validation/404 branches of generateLeadProposal here and build proposals directly via
  // the model for the listLeadProposals/sendLeadProposal happy-path tests.

  await t.test('lists proposals for a lead', async () => {
    const { token } = await createSuperAdmin();
    const lead = await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test' }).save();
    await LeadProposal.create({
      leadId: lead._id, proposalNumber: 'PROP-2026-0001', items: [{ description: 'Setup', amount: 100 }], totalAmount: 100,
    } as any);

    const res = await request(app)
      .get(`/api/v1/super-admin/leads/${lead._id}/proposals`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].proposalNumber, 'PROP-2026-0001');
  });

  await t.test('rejects generating a proposal with a packageId but no line items', async () => {
    const { token } = await createSuperAdmin();
    const lead = await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test' }).save();
    const pkg = await new Package({ name: 'Pro Plan', tier: 'PROFESSIONAL', maxUsers: 50, priceINR: 5000 }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/leads/${lead._id}/proposals`)
      .set('Authorization', authHeader(token))
      .send({ items: [], packageId: String(pkg._id) });

    assert.equal(res.status, 400);
  });

  await t.test('stores and surfaces the packageId on a lead proposal', async () => {
    const { token } = await createSuperAdmin();
    const lead = await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test' }).save();
    const pkg = await new Package({ name: 'Pro Plan', tier: 'PROFESSIONAL', maxUsers: 50, priceINR: 5000 }).save();
    await LeadProposal.create({
      leadId: lead._id, proposalNumber: 'PROP-2026-0003', packageId: pkg._id,
      items: [{ description: 'Pro Plan (PROFESSIONAL)', amount: 5000 }], totalAmount: 5000,
    } as any);

    const res = await request(app)
      .get(`/api/v1/super-admin/leads/${lead._id}`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.proposals[0].packageId.name, 'Pro Plan');
  });

  await t.test('rejects generating a proposal with no line items', async () => {
    const { token } = await createSuperAdmin();
    const lead = await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test' }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/leads/${lead._id}/proposals`)
      .set('Authorization', authHeader(token))
      .send({ items: [] });

    assert.equal(res.status, 400);
  });

  await t.test('returns 404 generating a proposal for a non-existent lead', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/leads/507f1f77bcf86cd799439099/proposals')
      .set('Authorization', authHeader(token))
      .send({ items: [{ description: 'Setup', amount: 100 }] });

    assert.equal(res.status, 404);
  });

  await t.test('returns 404 sending a non-existent proposal', async () => {
    const { token } = await createSuperAdmin();
    const lead = await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test' }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/leads/${lead._id}/proposals/507f1f77bcf86cd799439099/send`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 404);
  });

  await t.test('sends a proposal and advances the lead stage (no SMTP configured in test env)', async () => {
    const { token } = await createSuperAdmin();
    const lead = await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test', stage: 'LEAD' }).save();
    const proposal = await LeadProposal.create({
      leadId: lead._id, proposalNumber: 'PROP-2026-0002', items: [{ description: 'Setup', amount: 100 }], totalAmount: 100, pdfUrl: 'https://example.test/p.pdf',
    } as any);

    const res = await request(app)
      .post(`/api/v1/super-admin/leads/${lead._id}/proposals/${proposal._id}/send`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.emailSent, false);
    assert.equal(res.body.proposal.status, 'SENT');

    const updatedLead = await Lead.findById(lead._id);
    assert.equal(updatedLead?.stage, 'PROPOSAL_SENT');
  });
});

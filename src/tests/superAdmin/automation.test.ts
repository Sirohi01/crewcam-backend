import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, clearTestDB, createSuperAdmin, createRestrictedUser, authHeader } from '../testUtils/setup';
import { AutomationRule } from '../../models/AutomationRule';
import { AutomationLog } from '../../models/AutomationLog';
import { Lead } from '../../models/Lead';

test('super-admin automation endpoints', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('rejects requests with no auth token', async () => {
    const res = await request(app).get('/api/v1/super-admin/automation/rules');
    assert.equal(res.status, 401);
  });

  await t.test('rejects a non-super-admin role', async () => {
    const { token } = await createRestrictedUser([]);
    const res = await request(app)
      .get('/api/v1/super-admin/automation/rules')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 403);
  });

  await t.test('seeds and returns all automation rule types', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .get('/api/v1/super-admin/automation/rules')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 4);
    const types = res.body.map((r: any) => r.type).sort();
    assert.deepEqual(types, ['AI_CREDITS_LOW', 'LEAD_FOLLOWUP', 'LIFECYCLE_AUTO_ADVANCE', 'PAYMENT_REMINDER']);
  });

  await t.test('rejects updating an unknown automation rule type', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .put('/api/v1/super-admin/automation/rules/NOT_REAL')
      .set('Authorization', authHeader(token))
      .send({ isEnabled: false });
    assert.equal(res.status, 400);
  });

  await t.test('updates an automation rule', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .put('/api/v1/super-admin/automation/rules/AI_CREDITS_LOW')
      .set('Authorization', authHeader(token))
      .send({ isEnabled: false, threshold: 25 });

    assert.equal(res.status, 200);
    assert.equal(res.body.isEnabled, false);
    assert.equal(res.body.threshold, 25);

    const stored = await AutomationRule.findOne({ type: 'AI_CREDITS_LOW' });
    assert.equal(stored?.threshold, 25);
  });

  await t.test('returns paginated automation logs', async () => {
    const { token } = await createSuperAdmin();
    await AutomationLog.create({ type: 'AI_CREDITS_LOW', message: 'Test log', status: 'SUCCESS' } as any);

    const res = await request(app)
      .get('/api/v1/super-admin/automation/logs')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.pagination.total, 1);
  });

  await t.test('filters automation logs by type', async () => {
    const { token } = await createSuperAdmin();
    await AutomationLog.create({ type: 'AI_CREDITS_LOW', message: 'Credits log', status: 'SUCCESS' } as any);
    await AutomationLog.create({ type: 'LEAD_FOLLOWUP', message: 'Lead log', status: 'SUCCESS' } as any);

    const res = await request(app)
      .get('/api/v1/super-admin/automation/logs')
      .query({ type: 'LEAD_FOLLOWUP' })
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].type, 'LEAD_FOLLOWUP');
  });

  await t.test('filters automation logs by leadId', async () => {
    const { token } = await createSuperAdmin();
    const leadA = await new Lead({ companyName: 'Acme', contactName: 'John', contactEmail: 'john@acme.test' }).save();
    const leadB = await new Lead({ companyName: 'Beta', contactName: 'Jane', contactEmail: 'jane@beta.test' }).save();
    await AutomationLog.create({ type: 'LEAD_FOLLOWUP', message: 'Follow up Acme', status: 'SUCCESS', leadId: leadA._id } as any);
    await AutomationLog.create({ type: 'LEAD_FOLLOWUP', message: 'Follow up Beta', status: 'SUCCESS', leadId: leadB._id } as any);

    const res = await request(app)
      .get('/api/v1/super-admin/automation/logs')
      .query({ leadId: String(leadA._id) })
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].message, 'Follow up Acme');
  });

  // runAutomationNow runs all 4 checks for real (payment reminders, lead follow-ups, lifecycle
  // auto-advance, low AI credits). None of these require external credentials: sendMail no-ops
  // gracefully without SMTP configured, and the rest are pure DB operations — safe to exercise
  // the full success path here with no candidates so every check returns checked: 0.
  await t.test('runs all automation checks now', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/automation/run')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.paymentReminders.checked, 0);
    assert.equal(res.body.leadFollowUps.checked, 0);
    assert.equal(res.body.lifecycleAutoAdvance.checked, 0);
    assert.equal(res.body.aiCreditsLow.checked, 0);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { app, connectTestDB, disconnectTestDB, clearTestDB } from '../testUtils/setup';
import { Company } from '../../models/Company';
import { ManpowerRequest } from '../../models/ManpowerRequest';
import { Candidate } from '../../models/Candidate';

// Public Bharat Organic Expo careers API. Previously its queries had no tenant, so the
// tenant plugin rejected them (every call 500'd), and the design would have listed every
// company's jobs and filed applications under a random tenant id. It now belongs to the
// company whose website is bharatorganicexpo.com (Namogange Wellness).

const job = (tenantId: mongoose.Types.ObjectId, title: string) =>
  new ManpowerRequest({ tenantId, jobTitle: title, recruitmentStatus: 'Posted', status: 'Approved', publishChannels: ['Bharat Organic'] } as any).save();

test('Bharat Organic careers API', async (t) => {
  await connectTestDB();
  t.after(async () => {
    await disconnectTestDB();
  });
  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('returns 503 until a company is configured for the site', async () => {
    const res = await request(app).get('/api/v1/careers/bharat-organic/jobs');
    assert.equal(res.status, 503);
  });

  await t.test('is scoped to the configured company only', async () => {
    const namogange = new mongoose.Types.ObjectId();
    const other = new mongoose.Types.ObjectId();
    await Company.create([
      { tenantId: String(namogange), legalName: 'Namogange Wellness Pvt Ltd', email: 'hr@namogange.test', website: 'https://bharatorganicexpo.com' },
      { tenantId: String(other), legalName: 'Other Pvt Ltd', email: 'hr@other.test', website: 'https://other.test' },
    ] as any);
    const mine = await job(namogange, 'Organic Farming Lead');
    const theirs = await job(other, 'Secret Role');

    const list = await request(app).get('/api/v1/careers/bharat-organic/jobs');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.equal(list.body.count, 1);
    assert.ok(!JSON.stringify(list.body).includes('Secret Role'), 'another company\'s job leaked');

    assert.equal((await request(app).get(`/api/v1/careers/bharat-organic/jobs/${mine._id}`)).status, 200);
    assert.equal((await request(app).get(`/api/v1/careers/bharat-organic/jobs/${theirs._id}`)).status, 404);
    assert.equal((await request(app).get('/api/v1/careers/bharat-organic/jobs/not-an-id')).status, 404);

    const applicant = { firstName: 'Asha', lastName: 'Rao', email: 'Asha@Mail.Test', phone: '9876543210' };
    assert.equal((await request(app).post('/api/v1/careers/bharat-organic/apply').send({ ...applicant, jobId: theirs._id })).status, 404);
    assert.equal((await request(app).post('/api/v1/careers/bharat-organic/apply').send({ ...applicant, email: 'nope' })).status, 400);
    assert.equal((await request(app).post('/api/v1/careers/bharat-organic/apply').send({ ...applicant, phone: '' })).status, 400);

    const ok = await request(app).post('/api/v1/careers/bharat-organic/apply').send({ ...applicant, jobId: mine._id });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const candidate = await Candidate.findOne({ _id: ok.body.candidateId, tenantId: namogange }).lean();
    assert.ok(candidate, 'candidate must be filed under the configured company');
    assert.equal(candidate!.email, 'asha@mail.test');
  });
});

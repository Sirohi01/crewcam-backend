import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, clearTestDB, createSuperAdmin, createRestrictedUser, authHeader } from '../testUtils/setup';
import { LeadMasterData } from '../../models/LeadMasterData';

test('super-admin lead master data endpoints', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('rejects requests with no auth token', async () => {
    const res = await request(app).get('/api/v1/super-admin/leads/master-data');
    assert.equal(res.status, 401);
  });

  await t.test('rejects a non-super-admin role', async () => {
    const { token } = await createRestrictedUser([]);
    const res = await request(app)
      .get('/api/v1/super-admin/leads/master-data')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 403);
  });

  await t.test('creates a master data entry', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/leads/master-data')
      .set('Authorization', authHeader(token))
      .send({ type: 'SOURCE', value: 'LinkedIn Ads' });

    assert.equal(res.status, 201);
    assert.equal(res.body.type, 'SOURCE');
    assert.equal(res.body.value, 'LinkedIn Ads');
    assert.equal(res.body.isActive, true);
  });

  await t.test('rejects a duplicate value for the same type', async () => {
    const { token } = await createSuperAdmin();
    await LeadMasterData.create({ type: 'SOURCE', value: 'LinkedIn Ads' } as any);

    const res = await request(app)
      .post('/api/v1/super-admin/leads/master-data')
      .set('Authorization', authHeader(token))
      .send({ type: 'SOURCE', value: 'LinkedIn Ads' });

    assert.equal(res.status, 400);
  });

  await t.test('lists master data filtered by type', async () => {
    const { token } = await createSuperAdmin();
    await LeadMasterData.create({ type: 'SOURCE', value: 'Cold Call' } as any);
    await LeadMasterData.create({ type: 'LOST_REASON', value: 'Too expensive' } as any);

    const res = await request(app)
      .get('/api/v1/super-admin/leads/master-data')
      .query({ type: 'LOST_REASON' })
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].value, 'Too expensive');
  });

  await t.test('updates a master data entry', async () => {
    const { token } = await createSuperAdmin();
    const entry = await LeadMasterData.create({ type: 'SOURCE', value: 'Cold Call' } as any);

    const res = await request(app)
      .put(`/api/v1/super-admin/leads/master-data/${entry._id}`)
      .set('Authorization', authHeader(token))
      .send({ isActive: false });

    assert.equal(res.status, 200);
    assert.equal(res.body.isActive, false);
  });

  await t.test('returns 404 updating a non-existent entry', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .put('/api/v1/super-admin/leads/master-data/507f1f77bcf86cd799439099')
      .set('Authorization', authHeader(token))
      .send({ isActive: false });
    assert.equal(res.status, 404);
  });

  await t.test('deletes a master data entry', async () => {
    const { token } = await createSuperAdmin();
    const entry = await LeadMasterData.create({ type: 'SOURCE', value: 'Cold Call' } as any);

    const res = await request(app)
      .delete(`/api/v1/super-admin/leads/master-data/${entry._id}`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    const remaining = await LeadMasterData.findById(entry._id);
    assert.equal(remaining, null);
  });

  await t.test('returns 404 deleting a non-existent entry', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .delete('/api/v1/super-admin/leads/master-data/507f1f77bcf86cd799439099')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 404);
  });
});

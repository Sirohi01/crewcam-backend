import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, clearTestDB, createSuperAdmin, createRestrictedUser, authHeader } from '../testUtils/setup';
import { Package } from '../../models/Package';
import { Permission } from '../../models/Permission';
import { FeatureFlag } from '../../models/FeatureFlag';

test('super-admin packages/permissions/features endpoints', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('rejects requests with no auth token', async () => {
    const res = await request(app).get('/api/v1/super-admin/packages');
    assert.equal(res.status, 401);
  });

  await t.test('rejects a non-super-admin role', async () => {
    const { token } = await createRestrictedUser([]);
    const res = await request(app)
      .get('/api/v1/super-admin/packages')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 403);
  });

  // ---- Packages ----

  await t.test('lists only active packages', async () => {
    const { token } = await createSuperAdmin();
    await new Package({ name: 'Active Plan', maxUsers: 10, isActive: true }).save();
    await new Package({ name: 'Inactive Plan', maxUsers: 10, isActive: false }).save();

    const res = await request(app)
      .get('/api/v1/super-admin/packages')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].name, 'Active Plan');
  });

  await t.test('creates a package', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/packages')
      .set('Authorization', authHeader(token))
      .send({ name: 'Pro', tier: 'PROFESSIONAL', maxUsers: 50, priceINR: 5000 });

    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Pro');
    assert.equal(res.body.maxUsers, 50);
  });

  await t.test('updates a package', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();

    const res = await request(app)
      .put(`/api/v1/super-admin/packages/${pkg._id}`)
      .set('Authorization', authHeader(token))
      .send({ name: 'Basic Updated', maxUsers: 20, isActive: false });

    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Basic Updated');
    assert.equal(res.body.maxUsers, 20);
    assert.equal(res.body.isActive, false);
  });

  await t.test('returns 404 when updating a non-existent package', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .put('/api/v1/super-admin/packages/507f1f77bcf86cd799439099')
      .set('Authorization', authHeader(token))
      .send({ name: 'Nope' });
    assert.equal(res.status, 404);
  });

  // ---- Permissions ----

  await t.test('lists all permissions', async () => {
    const { token } = await createSuperAdmin();
    await new Permission({ name: 'VIEW_REPORTS', module: 'Reports', description: 'Can view reports' }).save();

    const res = await request(app)
      .get('/api/v1/super-admin/permissions')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].name, 'VIEW_REPORTS');
  });

  await t.test('creates a permission', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/permissions')
      .set('Authorization', authHeader(token))
      .send({ name: 'MANAGE_BILLING', module: 'Billing', description: 'Manage billing' });

    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'MANAGE_BILLING');
  });

  // ---- Features ----

  await t.test('lists all features sorted by name', async () => {
    const { token } = await createSuperAdmin();
    await new FeatureFlag({ name: 'Zeta', code: 'ZETA' }).save();
    await new FeatureFlag({ name: 'Alpha', code: 'ALPHA' }).save();

    const res = await request(app)
      .get('/api/v1/super-admin/features')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
    assert.equal(res.body[0].name, 'Alpha');
    assert.equal(res.body[1].name, 'Zeta');
  });

  await t.test('creates a feature', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/features')
      .set('Authorization', authHeader(token))
      .send({ name: 'AI Hiring', code: 'ai_hiring', description: 'AI hiring module' });

    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'AI Hiring');
    assert.equal(res.body.code, 'AI_HIRING');
  });

  await t.test('updates a feature', async () => {
    const { token } = await createSuperAdmin();
    const feature = await new FeatureFlag({ name: 'Old Name', code: 'OLDCODE' }).save();

    const res = await request(app)
      .put(`/api/v1/super-admin/features/${feature._id}`)
      .set('Authorization', authHeader(token))
      .send({ name: 'New Name', code: 'NEWCODE', isActive: false });

    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'New Name');
    assert.equal(res.body.isActive, false);
  });

  await t.test('returns 404 when updating a non-existent feature', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .put('/api/v1/super-admin/features/507f1f77bcf86cd799439099')
      .set('Authorization', authHeader(token))
      .send({ name: 'Nope' });
    assert.equal(res.status, 404);
  });

  await t.test('soft-deletes a feature by deactivating it', async () => {
    const { token } = await createSuperAdmin();
    const feature = await new FeatureFlag({ name: 'To Delete', code: 'TODELETE' }).save();

    const res = await request(app)
      .delete(`/api/v1/super-admin/features/${feature._id}`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);

    const updated = await FeatureFlag.findById(feature._id);
    assert.equal(updated?.isActive, false);
  });

  await t.test('returns 404 when deleting a non-existent feature', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .delete('/api/v1/super-admin/features/507f1f77bcf86cd799439099')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 404);
  });
});

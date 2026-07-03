import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, clearTestDB, createSuperAdmin, createRestrictedUser, authHeader } from '../testUtils/setup';
import { Package } from '../../models/Package';
import { Tenant } from '../../models/Tenant';

test('super-admin change-plan endpoint', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('rejects requests with no auth token', async () => {
    const res = await request(app).post('/api/v1/super-admin/tenants/507f1f77bcf86cd799439099/change-plan');
    assert.equal(res.status, 401);
  });

  await t.test('rejects a non-super-admin role', async () => {
    const { token } = await createRestrictedUser([]);
    const res = await request(app)
      .post('/api/v1/super-admin/tenants/507f1f77bcf86cd799439099/change-plan')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 403);
  });

  await t.test('rejects change-plan without a packageId', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/tenants/507f1f77bcf86cd799439099/change-plan')
      .set('Authorization', authHeader(token))
      .send({});
    assert.equal(res.status, 400);
  });

  await t.test('returns 404 for a non-existent tenant', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Pro', tier: 'PROFESSIONAL', maxUsers: 50 }).save();
    const res = await request(app)
      .post('/api/v1/super-admin/tenants/507f1f77bcf86cd799439099/change-plan')
      .set('Authorization', authHeader(token))
      .send({ packageId: String(pkg._id) });
    assert.equal(res.status, 404);
  });

  await t.test('rejects an inactive target package', async () => {
    const { token } = await createSuperAdmin();
    const basic = await new Package({ name: 'Basic', tier: 'BASIC', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: basic._id }).save();
    const inactivePkg = await new Package({ name: 'Gone', tier: 'PROFESSIONAL', maxUsers: 50, isActive: false }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/change-plan`)
      .set('Authorization', authHeader(token))
      .send({ packageId: String(inactivePkg._id) });
    assert.equal(res.status, 400);
  });

  await t.test('rejects switching to the same plan with no billing cycle change', async () => {
    const { token } = await createSuperAdmin();
    const basic = await new Package({ name: 'Basic', tier: 'BASIC', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: basic._id }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/change-plan`)
      .set('Authorization', authHeader(token))
      .send({ packageId: String(basic._id) });
    assert.equal(res.status, 400);
  });

  await t.test('upgrades a tenant to a higher tier plan', async () => {
    const { token } = await createSuperAdmin();
    const basic = await new Package({ name: 'Basic', tier: 'BASIC', maxUsers: 10, pricePerUserMonthlyINR: 100 }).save();
    const pro = await new Package({ name: 'Pro', tier: 'PROFESSIONAL', maxUsers: 50, pricePerUserMonthlyINR: 200 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: basic._id, userLimit: 10, subscriptionAmount: 1000 }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/change-plan`)
      .set('Authorization', authHeader(token))
      .send({ packageId: String(pro._id) });

    assert.equal(res.status, 200);
    assert.equal(res.body.direction, 'UPGRADE');
    assert.equal(res.body.newSubscriptionAmount, 2000);

    const updated = await Tenant.findById(tenant._id);
    assert.equal(String(updated?.packageId), String(pro._id));
  });

  await t.test('downgrades a tenant to a lower tier plan', async () => {
    const { token } = await createSuperAdmin();
    const pro = await new Package({ name: 'Pro', tier: 'PROFESSIONAL', maxUsers: 50, pricePerUserMonthlyINR: 200 }).save();
    const basic = await new Package({ name: 'Basic', tier: 'BASIC', maxUsers: 10, pricePerUserMonthlyINR: 100 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: pro._id, userLimit: 10, subscriptionAmount: 2000 }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/change-plan`)
      .set('Authorization', authHeader(token))
      .send({ packageId: String(basic._id) });

    assert.equal(res.status, 200);
    assert.equal(res.body.direction, 'DOWNGRADE');
  });
});

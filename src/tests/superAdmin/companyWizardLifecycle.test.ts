import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, clearTestDB, createSuperAdmin, createRestrictedUser, authHeader } from '../testUtils/setup';
import { Package } from '../../models/Package';
import { Tenant } from '../../models/Tenant';
import { Company } from '../../models/Company';
import { Invoice } from '../../models/Invoice';
import { CompanyLifecycleEvent } from '../../models/CompanyLifecycleEvent';
import { User } from '../../models/User';

function wizardPayload(overrides: Record<string, any> = {}) {
  return {
    name: 'Acme Inc', legalName: 'Acme Incorporated',
    pendingAdminFirstName: 'Jane', pendingAdminLastName: 'Doe', pendingAdminEmail: 'wizard@acme.test',
    packageId: overrides.packageId,
    ...overrides,
  };
}

test('super-admin company wizard and lifecycle endpoints', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('rejects requests with no auth token', async () => {
    const res = await request(app).post('/api/v1/super-admin/companies/wizard');
    assert.equal(res.status, 401);
  });

  await t.test('rejects a non-super-admin role', async () => {
    const { token } = await createRestrictedUser([]);
    const res = await request(app)
      .post('/api/v1/super-admin/companies/wizard')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 403);
  });

  // ---- Company wizard ----

  await t.test('rejects the wizard with an invalid payload', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/companies/wizard')
      .set('Authorization', authHeader(token))
      .send({ name: 'A' });
    assert.equal(res.status, 400);
  });

  await t.test('rejects the wizard with a non-existent package', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/companies/wizard')
      .set('Authorization', authHeader(token))
      .send(wizardPayload({ packageId: '507f1f77bcf86cd799439099' }));
    assert.equal(res.status, 400);
  });

  await t.test('rejects the wizard when the admin email already exists', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    await new User({ email: 'wizard@acme.test', passwordHash: 'x', firstName: 'Existing', lastName: 'User', tenantId: 'OTHER_TENANT' }).save();

    const res = await request(app)
      .post('/api/v1/super-admin/companies/wizard')
      .set('Authorization', authHeader(token))
      .send(wizardPayload({ packageId: String(pkg._id) }));
    assert.equal(res.status, 400);
  });

  await t.test('creates a company draft without provisioning a login account', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10, setupFeeINR: 5000, pricePerUserMonthlyINR: 100, freeAiCredits: 50 }).save();

    const res = await request(app)
      .post('/api/v1/super-admin/companies/wizard')
      .set('Authorization', authHeader(token))
      .send(wizardPayload({ packageId: String(pkg._id) }));

    assert.equal(res.status, 201);
    assert.equal(res.body.tenant.name, 'Acme Inc');
    assert.equal(res.body.tenant.lifecycleStatus, 'SUBSCRIPTION_PENDING');
    assert.equal(res.body.tenant.aiCredits, 50);

    const company = await Company.findOne({ tenantId: res.body.tenant._id }).setOptions({ bypassTenantIsolation: true });
    assert.equal(company?.pendingAdminEmail, 'wizard@acme.test');

    const adminUser = await User.findOne({ email: 'wizard@acme.test' }).setOptions({ bypassTenantIsolation: true });
    assert.equal(adminUser, null);
  });

  // ---- Lifecycle ----

  await t.test('returns 404 for the lifecycle timeline of a non-existent tenant', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .get('/api/v1/super-admin/tenants/507f1f77bcf86cd799439099/lifecycle')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 404);
  });

  await t.test('returns the lifecycle timeline for a tenant', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: pkg._id }).save();

    const res = await request(app)
      .get(`/api/v1/super-admin/tenants/${tenant._id}/lifecycle`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.tenant.name, 'Acme');
    assert.ok(Array.isArray(res.body.sequence));
    assert.ok(Array.isArray(res.body.events));
  });

  await t.test('rejects setting an invalid lifecycle status', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: pkg._id }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/lifecycle`)
      .set('Authorization', authHeader(token))
      .send({ status: 'NOT_REAL' });
    assert.equal(res.status, 400);
  });

  await t.test('returns 404 setting lifecycle status for a non-existent tenant', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/tenants/507f1f77bcf86cd799439099/lifecycle')
      .set('Authorization', authHeader(token))
      .send({ status: 'DEMO_SCHEDULED' });
    assert.equal(res.status, 404);
  });

  await t.test('sets a tenant lifecycle status and records a timeline event', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: pkg._id }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/lifecycle`)
      .set('Authorization', authHeader(token))
      .send({ status: 'DEMO_SCHEDULED', note: 'Demo booked for next week' });

    assert.equal(res.status, 200);
    assert.equal(res.body.lifecycleStatus, 'DEMO_SCHEDULED');

    const events = await CompanyLifecycleEvent.find({ tenantId: tenant._id });
    assert.equal(events.length, 1);
    assert.equal(events[0]!.toStatus, 'DEMO_SCHEDULED');
  });

  await t.test('returns 404 advancing the lifecycle of a non-existent tenant', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/tenants/507f1f77bcf86cd799439099/lifecycle/advance')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 404);
  });

  await t.test('advances a tenant to the next lifecycle stage in sequence', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: pkg._id, lifecycleStatus: 'LEAD' }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/lifecycle/advance`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.lifecycleStatus, 'DEMO_SCHEDULED');
  });

  await t.test('rejects advancing a tenant that is already at the final stage', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: pkg._id, lifecycleStatus: 'LIVE' }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/lifecycle/advance`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 400);
  });

  await t.test('rejects advancing a tenant that is outside the standard sequence', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: pkg._id, lifecycleStatus: 'SUSPENDED' }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/lifecycle/advance`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 400);
  });

  // ---- Provision workspace ----

  await t.test('returns 404 provisioning the workspace of a non-existent tenant', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/tenants/507f1f77bcf86cd799439099/lifecycle/provision-workspace')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 404);
  });

  await t.test('rejects provisioning the workspace when payments are incomplete', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: pkg._id, setupFeeStatus: 'PENDING', subscriptionStatus: 'PENDING' }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/lifecycle/provision-workspace`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 400);
  });

  await t.test('provisions the workspace once setup fee and subscription are paid', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({
      name: 'Acme', packageId: pkg._id, setupFeeStatus: 'PAID', subscriptionStatus: 'ACTIVE', lifecycleStatus: 'SETUP_FEE_PAID',
    }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/lifecycle/provision-workspace`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.lifecycleStatus, 'WORKSPACE_PROVISIONING');
  });

  await t.test('reports already provisioned when called again past the provisioning stage', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({
      name: 'Acme', packageId: pkg._id, setupFeeStatus: 'PAID', subscriptionStatus: 'ACTIVE', lifecycleStatus: 'CONFIGURATION',
    }).save();

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/lifecycle/provision-workspace`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.alreadyProvisioned, true);
  });

  await t.test('prefers invoice status over legacy tenant flags when checking payment completion', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({
      name: 'Acme', packageId: pkg._id, setupFeeStatus: 'PAID', subscriptionStatus: 'ACTIVE', lifecycleStatus: 'SETUP_FEE_PAID',
    }).save();
    await Invoice.create({
      tenantId: tenant._id, invoiceNumber: 'INV-2026-0099', type: 'SETUP_FEE', amount: 5000, totalAmount: 5000, status: 'PENDING',
    } as any);

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/lifecycle/provision-workspace`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 400);
  });
});

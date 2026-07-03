import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, clearTestDB, createSuperAdmin, createRestrictedUser, authHeader } from '../testUtils/setup';
import { Package } from '../../models/Package';
import { Tenant } from '../../models/Tenant';
import { Role } from '../../models/Role';
import { User } from '../../models/User';
import { AiUsageLog } from '../../models/AiUsageLog';
import { Payment } from '../../models/Payment';

async function createTenantWithAdmin(adminEmail = 'admin@acme.test') {
  const pkg = await new Package({ name: 'Basic', maxUsers: 10, aiCreditTopUpPriceINR: 10 }).save();
  const tenant = await new Tenant({ name: 'Acme', packageId: pkg._id, setupFeeAmount: 5000, subscriptionAmount: 2000 }).save();
  const role = await new Role({ name: 'Company Admin', permissions: ['*'], category: 'company_admin', tenantId: String(tenant._id) }).save();
  const admin = await new User({
    email: adminEmail, passwordHash: 'x', firstName: 'Jane', lastName: 'Doe',
    roleId: role._id, tenantId: String(tenant._id),
  }).save();
  return { tenant, role, admin, pkg };
}

test('super-admin tenant action endpoints', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('rejects requests with no auth token', async () => {
    const res = await request(app).get('/api/v1/super-admin/ai-usage-logs');
    assert.equal(res.status, 401);
  });

  await t.test('rejects a non-super-admin role', async () => {
    const { token } = await createRestrictedUser([]);
    const res = await request(app)
      .get('/api/v1/super-admin/ai-usage-logs')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 403);
  });

  // ---- AI usage logs ----

  await t.test('requires a tenantId query param for AI usage logs', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .get('/api/v1/super-admin/ai-usage-logs')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 400);
  });

  await t.test('returns AI usage logs for a tenant', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();
    await AiUsageLog.create({
      tenantId: String(tenant._id), feature: 'RESUME_PARSE', status: 'SUCCESS', promptTokens: 10, completionTokens: 20, totalTokens: 30,
    } as any);

    const res = await request(app)
      .get('/api/v1/super-admin/ai-usage-logs')
      .query({ tenantId: String(tenant._id) })
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].feature, 'RESUME_PARSE');
  });

  // ---- Resend credentials ----

  await t.test('rejects resend-credentials with a weak password', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();
    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/resend-credentials`)
      .set('Authorization', authHeader(token))
      .send({ newPassword: 'weak' });
    assert.equal(res.status, 400);
  });

  await t.test('returns 404 resending credentials for a non-existent tenant', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/tenants/507f1f77bcf86cd799439099/resend-credentials')
      .set('Authorization', authHeader(token))
      .send({ newPassword: 'Password1' });
    assert.equal(res.status, 404);
  });

  await t.test('resends credentials and resets the admin password (no SMTP configured in test env)', async () => {
    const { token } = await createSuperAdmin();
    const { tenant, admin } = await createTenantWithAdmin('resend@acme.test');

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/resend-credentials`)
      .set('Authorization', authHeader(token))
      .send({ newPassword: 'Password1' });

    assert.equal(res.status, 200);
    assert.equal(res.body.adminEmail, 'resend@acme.test');
    // No SMTP creds in test env, so sendMail no-ops gracefully and the password is returned as a fallback.
    assert.equal(res.body.credentialsEmailSent, false);
    assert.equal(res.body.adminPasswordFallback, 'Password1');

    const updatedAdmin = await User.findOne({ _id: admin._id }).setOptions({ bypassTenantIsolation: true });
    assert.ok(updatedAdmin?.passwordHash !== admin.passwordHash);
  });

  // ---- Top-up AI credits ----

  await t.test('rejects topup-ai-credits with non-positive credits', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();
    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/topup-ai-credits`)
      .set('Authorization', authHeader(token))
      .send({ credits: 0 });
    assert.equal(res.status, 400);
  });

  await t.test('returns 404 topping up credits for a non-existent tenant', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/tenants/507f1f77bcf86cd799439099/topup-ai-credits')
      .set('Authorization', authHeader(token))
      .send({ credits: 10 });
    assert.equal(res.status, 404);
  });

  await t.test('tops up AI credits and records a payment', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/topup-ai-credits`)
      .set('Authorization', authHeader(token))
      .send({ credits: 10 });

    assert.equal(res.status, 200);
    assert.equal(res.body.aiCredits, 10);
    assert.equal(res.body.amountCharged, 100);

    const payments = await Payment.find({ tenantId: tenant._id });
    assert.equal(payments.length, 1);
    assert.equal(payments[0]!.type, 'AI_CREDIT_TOPUP');
  });

  // ---- Mark setup fee paid ----

  await t.test('returns 404 marking setup fee paid for a non-existent tenant', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/tenants/507f1f77bcf86cd799439099/mark-setup-fee-paid')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 404);
  });

  await t.test('marks the setup fee as paid and records a payment', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/mark-setup-fee-paid`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.setupFeeStatus, 'PAID');

    const payments = await Payment.find({ tenantId: tenant._id, type: 'SETUP_FEE' });
    assert.equal(payments.length, 1);
    assert.equal(payments[0]!.amount, 5000);
  });

  // ---- Record subscription payment ----

  await t.test('returns 404 recording subscription payment for a non-existent tenant', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/tenants/507f1f77bcf86cd799439099/record-subscription-payment')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 404);
  });

  await t.test('records a subscription payment and activates the subscription', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();

    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/record-subscription-payment`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.subscriptionStatus, 'ACTIVE');
    assert.ok(res.body.nextRenewalDate);

    const payments = await Payment.find({ tenantId: tenant._id, type: 'SUBSCRIPTION' });
    assert.equal(payments.length, 1);
    assert.equal(payments[0]!.amount, 2000);
  });
});

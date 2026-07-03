import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, clearTestDB, createSuperAdmin, createRestrictedUser, authHeader } from '../testUtils/setup';
import { Package } from '../../models/Package';
import { Tenant } from '../../models/Tenant';
import { AuditLog } from '../../models/AuditLog';
import { Ticket } from '../../models/Ticket';
import { User } from '../../models/User';

test('super-admin platform endpoints', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('rejects requests with no auth token', async () => {
    const res = await request(app).get('/api/v1/super-admin/dashboard-stats');
    assert.equal(res.status, 401);
  });

  await t.test('rejects a non-super-admin role', async () => {
    const { token } = await createRestrictedUser([]);
    const res = await request(app)
      .get('/api/v1/super-admin/dashboard-stats')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 403);
  });

  await t.test('returns platform dashboard stats', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    await new Tenant({ name: 'Acme', packageId: pkg._id }).save();

    const res = await request(app)
      .get('/api/v1/super-admin/dashboard-stats')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.totalTenants, 1);
    assert.ok(Array.isArray(res.body.growth));
    assert.ok(Array.isArray(res.body.recentTenants));
    assert.ok(Array.isArray(res.body.paymentAlerts));
  });

  await t.test('computes MRR, ARPU and churn rate', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();

    // Active monthly subscriber: 1000 INR/month counts in full.
    await new Tenant({
      name: 'Monthly Co', packageId: pkg._id,
      subscriptionStatus: 'ACTIVE', billingCycle: 'MONTHLY', subscriptionAmount: 1000, subscriptionCurrency: 'INR',
    }).save();
    // Active yearly subscriber: 12000 INR/year normalizes to 1000 INR/month.
    await new Tenant({
      name: 'Yearly Co', packageId: pkg._id,
      subscriptionStatus: 'ACTIVE', billingCycle: 'YEARLY', subscriptionAmount: 12000, subscriptionCurrency: 'INR',
    }).save();
    // Pre-existing subscriber who cancelled today (within the default "today" range).
    // Mongoose timestamps always stamp createdAt with "now" on save, so backdate it
    // via a raw collection update afterwards (Tenant isn't tenant-isolation scoped).
    const cancelledTenant = await new Tenant({
      name: 'Cancelled Co', packageId: pkg._id,
      subscriptionStatus: 'CANCELLED', billingCycle: 'MONTHLY', subscriptionAmount: 500, subscriptionCurrency: 'INR',
    }).save();
    await Tenant.collection.updateOne({ _id: cancelledTenant._id }, { $set: { createdAt: new Date('2020-01-01') } });

    const res = await request(app)
      .get('/api/v1/super-admin/dashboard-stats')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.mrrINR, 2000);
    assert.equal(res.body.arpuINR, 1000);
    assert.equal(res.body.churnRatePercent, 100);
  });

  await t.test('accepts a custom date range for dashboard stats', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .get('/api/v1/super-admin/dashboard-stats')
      .query({ range: 'week' })
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.range, 'week');
  });

  await t.test('returns paginated platform audit logs', async () => {
    const { token, user } = await createSuperAdmin();
    await AuditLog.create({
      tenantId: 'SUPER_ADMIN', userId: user._id, action: 'LOGIN', module: 'Auth', status: 'SUCCESS',
    } as any);

    const res = await request(app)
      .get('/api/v1/super-admin/audit-logs')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.pagination.total, 1);
  });

  await t.test('filters platform audit logs by module and search', async () => {
    const { token, user } = await createSuperAdmin();
    await AuditLog.create({ tenantId: 'SUPER_ADMIN', userId: user._id, action: 'LOGIN', module: 'Auth', status: 'SUCCESS' } as any);
    await AuditLog.create({ tenantId: 'SUPER_ADMIN', userId: user._id, action: 'CREATE_LEAD', module: 'CRM', status: 'SUCCESS' } as any);

    const res = await request(app)
      .get('/api/v1/super-admin/audit-logs')
      .query({ module: 'CRM' })
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].module, 'CRM');
  });

  await t.test('returns paginated platform tickets', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: pkg._id }).save();
    const employee = await new User({
      email: 'emp@acme.test', passwordHash: 'x', firstName: 'Emp', lastName: 'Loyee',
      tenantId: tenant._id,
    }).save();
    await Ticket.create({
      tenantId: tenant._id, employeeId: employee._id, department: 'IT', subject: 'Laptop broken',
      description: 'Screen cracked', priority: 'Urgent', status: 'Open',
    } as any);

    const res = await request(app)
      .get('/api/v1/super-admin/tickets')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.openCount, 1);
    assert.equal(res.body.urgentCount, 1);
  });

  await t.test('returns reports summary', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    await new Tenant({ name: 'Acme', packageId: pkg._id }).save();

    const res = await request(app)
      .get('/api/v1/super-admin/reports/summary')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.revenueByMonth));
    assert.equal(res.body.revenueByMonth.length, 12);
    assert.ok(Array.isArray(res.body.packageDistribution));
    assert.ok(Array.isArray(res.body.leadFunnel));
    assert.equal(res.body.totalCompanies, 1);
  });
});

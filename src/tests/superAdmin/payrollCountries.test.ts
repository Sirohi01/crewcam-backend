import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { app, connectTestDB, disconnectTestDB, clearTestDB, authHeader, createSuperAdmin, createRestrictedUser } from '../testUtils/setup';
import { User } from '../../models/User';
import { Role } from '../../models/Role';
import { Company } from '../../models/Company';
import { PayrollCountry } from '../../models/dropdowns/PayrollCountry';
import { signAccessToken } from '../../utils/authTokens';

// Phase 4 foundation: payroll rules per country, managed by Super Admin.

const india = (overrides: Record<string, unknown> = {}) => ({
  name: 'India', code: 'in', currencyCode: 'inr', financialYearStartMonth: 4, isDefault: true,
  statutoryComponents: [
    { code: 'PF', name: 'Provident Fund', kind: 'employee_deduction', base: 'basic_da', employeeRate: 12, employerRate: 12, wageCeiling: 15000 },
    { code: 'ESI', name: 'ESI', kind: 'employee_deduction', base: 'gross', employeeRate: 0.75, employerRate: 3.25, eligibilityMaxGross: 21000 },
  ],
  taxRegimes: [
    { code: 'NEW', name: 'New regime', financialYear: '2025-26', isDefault: true, slabs: [{ upTo: 400000, rate: 0 }, { upTo: 800000, rate: 5 }, { upTo: '', rate: 30 }], standardDeduction: 75000, cessRate: 4 },
  ],
  ...overrides,
});

test('payroll country catalogue', async (t) => {
  await connectTestDB();
  t.after(async () => {
    await disconnectTestDB();
  });
  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('super admin creates and edits countries; codes normalised; one default', async () => {
    const { token } = await createSuperAdmin();
    const created = await request(app).post('/api/v1/super-admin/payroll-countries').set('Authorization', authHeader(token)).send(india());
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.code, 'IN');
    assert.equal(created.body.data.currencyCode, 'INR');
    assert.equal(created.body.data.taxRegimes[0].slabs[2].upTo, null, 'blank upper bound = open-ended');

    const uae = await request(app).post('/api/v1/super-admin/payroll-countries').set('Authorization', authHeader(token))
      .send({ name: 'United Arab Emirates', code: 'AE', currencyCode: 'AED', financialYearStartMonth: 1, isDefault: true });
    assert.equal(uae.status, 201, JSON.stringify(uae.body));
    const defaults = await PayrollCountry.find({ isDefault: true }).lean();
    assert.deepEqual(defaults.map((d) => d.code), ['AE'], 'making a country default clears the previous one');

    const edited = await request(app).put(`/api/v1/super-admin/payroll-countries/${created.body.data._id}`).set('Authorization', authHeader(token))
      .send(india({ isDefault: false, statutoryComponents: [{ code: 'PF', name: 'Provident Fund', kind: 'employee_deduction', base: 'basic_da', employeeRate: 10, employerRate: 12 }] }));
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.data.statutoryComponents[0].employeeRate, 10);
  });

  await t.test('rejects invalid rules', async () => {
    const { token } = await createSuperAdmin();
    const post = (body: Record<string, unknown>) => request(app).post('/api/v1/super-admin/payroll-countries').set('Authorization', authHeader(token)).send(body);

    assert.equal((await post(india({ code: 'IND' }))).status, 400, '2-letter code');
    assert.equal((await post(india({ statutoryComponents: [{ code: 'PF', name: 'PF', kind: 'employee_deduction', base: 'basic', employeeRate: 120 }] }))).status, 400, 'rate > 100%');
    assert.equal((await post(india({ statutoryComponents: [
      { code: 'PF', name: 'PF', kind: 'employee_deduction', base: 'basic' },
      { code: 'pf', name: 'PF again', kind: 'employee_deduction', base: 'basic' },
    ] }))).status, 400, 'duplicate component code');
    assert.equal((await post(india({ taxRegimes: [{ code: 'NEW', name: 'x', financialYear: '2025-26', slabs: [{ upTo: 800000, rate: 5 }, { upTo: 400000, rate: 10 }] }] }))).status, 400, 'slabs must increase');
    assert.equal((await post(india({ taxRegimes: [{ code: 'NEW', name: 'x', financialYear: '2025-26', slabs: [{ upTo: null, rate: 0 }, { upTo: 800000, rate: 5 }] }] }))).status, 400, 'only last slab open-ended');
    assert.equal((await post(india({ taxRegimes: [
      { code: 'NEW', name: 'a', financialYear: '2025-26', isDefault: true, slabs: [{ upTo: null, rate: 0 }] },
      { code: 'OLD', name: 'b', financialYear: '2025-26', isDefault: true, slabs: [{ upTo: null, rate: 0 }] },
    ] }))).status, 400, 'one default regime per year');
  });

  await t.test('only super admins manage the catalogue', async () => {
    const { token } = await createRestrictedUser(['EMPLOYEE_WRITE']);
    const res = await request(app).post('/api/v1/super-admin/payroll-countries').set('Authorization', authHeader(token)).send(india());
    assert.equal(res.status, 403);
  });

  await t.test('a country in use cannot be deleted', async () => {
    const { token } = await createSuperAdmin();
    const created = await request(app).post('/api/v1/super-admin/payroll-countries').set('Authorization', authHeader(token)).send(india());
    await Company.create({ tenantId: new mongoose.Types.ObjectId().toString(), legalName: 'Acme', email: 'a@acme.test', payrollCountry: 'IN' } as any);
    const res = await request(app).delete(`/api/v1/super-admin/payroll-countries/${created.body.data._id}`).set('Authorization', authHeader(token));
    assert.equal(res.status, 409);
  });

  await t.test('a company reads its own payroll country, or the platform default', async () => {
    const { token: saToken } = await createSuperAdmin();
    await request(app).post('/api/v1/super-admin/payroll-countries').set('Authorization', authHeader(saToken)).send(india());
    await request(app).post('/api/v1/super-admin/payroll-countries').set('Authorization', authHeader(saToken))
      .send({ name: 'United Arab Emirates', code: 'AE', currencyCode: 'AED', financialYearStartMonth: 1, isDefault: false });

    const tenantId = new mongoose.Types.ObjectId().toString();
    const role = await new Role({ name: 'Emp', permissions: [], tenantId }).save();
    const user = await new User({ email: 'emp@acme.test', passwordHash: await bcrypt.hash('Sup3rSecret!', 4), firstName: 'E', lastName: 'U', roleId: role._id, tenantId, isActive: true }).save();
    const token = signAccessToken(user);

    const fallback = await request(app).get('/api/v1/payroll-config').set('Authorization', authHeader(token));
    assert.equal(fallback.status, 200);
    assert.equal(fallback.body.data.code, 'IN', 'no company setting -> platform default');

    await Company.create({ tenantId, legalName: 'Acme', email: 'a@acme.test', payrollCountry: 'AE' } as any);
    const own = await request(app).get('/api/v1/payroll-config').set('Authorization', authHeader(token));
    assert.equal(own.body.data.code, 'AE');
  });
});

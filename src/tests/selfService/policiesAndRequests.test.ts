import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { app, connectTestDB, disconnectTestDB, clearTestDB, authHeader } from '../testUtils/setup';
import { User } from '../../models/User';
import { Role } from '../../models/Role';
import { Tenant } from '../../models/Tenant';
import { Package } from '../../models/Package';
import { CompanyPolicy } from '../../models/CompanyPolicy';
import { LeaveType } from '../../models/LeaveType';
import { LeaveRequest } from '../../models/LeaveRequest';
import { Expense } from '../../models/Expense';
import { Notification } from '../../models/Notification';
import { signAccessToken } from '../../utils/authTokens';

// Phase 1D-2 — company policies for employees (read + acknowledge without MASTER_READ),
// "My Requests", and the approval holes found on the way: approvers could decide their
// own leave/expense, and a decided leave/expense could be flipped.

let TENANT = '';
let seq = 0;
const DEPT_A = new mongoose.Types.ObjectId();
const DEPT_B = new mongoose.Types.ObjectId();

async function createTenant() {
  const pkg = await new Package({ name: `plan ${++seq}`, maxUsers: 50, features: ['*'], isActive: true }).save();
  return String((await new Tenant({ name: `Delta ${seq}`, packageId: pkg._id }).save())._id);
}

async function createUser(label: string, permissions: string[] = ['profile_read', 'attendance_read'], extra: Record<string, unknown> = {}) {
  const role = await new Role({ name: `${label} role ${++seq}`, permissions, tenantId: TENANT }).save();
  const user = await new User({
    email: `${label}@test.crewcam.app`, passwordHash: await bcrypt.hash('x', 4), firstName: label, lastName: 'T',
    roleId: role._id, tenantId: TENANT, isActive: true, ...extra,
  }).save();
  return { user, token: authHeader(signAccessToken(user)) };
}

const policy = (over: Record<string, unknown>) => CompanyPolicy.create({
  tenantId: TENANT, title: 'Leave Policy', code: `P${++seq}`, category: 'HR Policies', type: 'Mandatory', status: 'Published',
  effectiveFrom: new Date(), version: '1.0', shortDescription: 'How leave works', settings: { requireAck: true, showInPortal: true },
  createdBy: new mongoose.Types.ObjectId(), updatedBy: new mongoose.Types.ObjectId(), ...over,
} as any);

test('policies, my requests and approval rules', async (t) => {
  await connectTestDB();
  t.after(disconnectTestDB);
  t.beforeEach(async () => { TENANT = await createTenant(); });
  t.afterEach(clearTestDB);

  await t.test('employees see only published, portal-visible policies that apply to them', async () => {
    const amy = await createUser('amy', undefined, { departmentId: DEPT_A });
    await policy({ title: 'Company-wide' });
    await policy({ title: 'Draft one', status: 'Draft' });
    await policy({ title: 'Hidden', settings: { showInPortal: false } });
    await policy({ title: 'Dept A only', applicability: { allEmployees: false, departments: [DEPT_A], designations: [], locations: [] } });
    await policy({ title: 'Dept B only', applicability: { allEmployees: false, departments: [DEPT_B], designations: [], locations: [] } });

    const res = await request(app).get('/api/v1/me/policies').set('Authorization', amy.token);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.items.map((p: any) => p.title).sort(), ['Company-wide', 'Dept A only']);
    assert.equal(res.body.summary.pendingAck, 2);
    assert.equal(res.body.items[0].applicability, undefined, 'targeting rules are not exposed');

    // The HR-side list still needs MASTER_READ.
    assert.equal((await request(app).get('/api/v1/company-policies').set('Authorization', amy.token)).status, 403);
  });

  await t.test('acknowledging: explicit consent, once per version, only for applicable policies', async () => {
    const amy = await createUser('amy', undefined, { departmentId: DEPT_A });
    const hr = await createUser('hr', ['EMPLOYEE_READ', 'MASTER_READ', 'MASTER_WRITE']);
    const p = await policy({});
    const other = await policy({ applicability: { allEmployees: false, departments: [DEPT_B], designations: [], locations: [] } });

    assert.equal((await request(app).post(`/api/v1/me/policies/${p._id}/acknowledge`).set('Authorization', amy.token).send({})).status, 400);
    assert.equal((await request(app).post(`/api/v1/me/policies/${other._id}/acknowledge`).set('Authorization', amy.token).send({ agree: true })).status, 404);
    assert.equal((await request(app).post(`/api/v1/me/policies/${p._id}/acknowledge`).set('Authorization', amy.token).send({ agree: true })).status, 200);
    assert.equal((await request(app).post(`/api/v1/me/policies/${p._id}/acknowledge`).set('Authorization', amy.token).send({ agree: true })).status, 200);

    let report = await request(app).get(`/api/v1/company-policies/${p._id}/acknowledgements`).set('Authorization', hr.token);
    assert.equal(report.status, 200);
    assert.deepEqual(report.body.acknowledged.map((e: any) => e.firstName), ['amy']);
    assert.ok(report.body.pending.some((e: any) => e.firstName === 'hr'));

    // A new version needs a fresh acknowledgement, and is announced.
    await request(app).put(`/api/v1/company-policies/${p._id}`).set('Authorization', hr.token).send({ version: '2.0' });
    const mine = await request(app).get('/api/v1/me/policies').set('Authorization', amy.token);
    assert.equal(mine.body.items.find((x: any) => x._id === String(p._id)).acknowledgedAt, null);
    report = await request(app).get(`/api/v1/company-policies/${p._id}/acknowledgements`).set('Authorization', hr.token);
    assert.equal(report.body.acknowledged.length, 0);
    assert.equal(await Notification.countDocuments({ tenantId: TENANT, title: /Policy updated/ } as any), 1);
  });

  await t.test('HR policy writes ignore tenantId/createdBy, reject outside documents, and announce on publish', async () => {
    const hr = await createUser('hr', ['MASTER_READ', 'MASTER_WRITE']);
    const body = {
      title: 'IT Policy', code: 'IT-1', category: 'IT Policies', type: 'Mandatory', status: 'Published', effectiveFrom: '2026-01-01',
      version: '1.0', shortDescription: 'Use of laptops', settings: { requireAck: true },
    };
    assert.equal((await request(app).post('/api/v1/company-policies').set('Authorization', hr.token)
      .send({ ...body, documentUrl: 'https://evil.example.com/x.pdf' })).status, 400);

    const fake = String(new mongoose.Types.ObjectId());
    const created = await request(app).post('/api/v1/company-policies').set('Authorization', hr.token).send({ ...body, createdBy: fake });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(String(created.body.data.createdBy), String(hr.user._id));
    const n = await Notification.findOne({ tenantId: TENANT, title: 'New policy: IT Policy' } as any);
    assert.ok(n);
    assert.equal(n!.priority, 'High');
  });

  await t.test('leave: no deciding your own, no flipping a decision, employees can withdraw pending', async () => {
    const amy = await createUser('amy');
    const hr = await createUser('hr', ['EMPLOYEE_WRITE', 'EMPLOYEE_READ']);
    const type = await LeaveType.create({ tenantId: TENANT, name: 'Casual', code: 'CL', defaultDays: 12 } as any);
    const mk = (userId: unknown) => LeaveRequest.create({ tenantId: TENANT, userId, leaveTypeId: type._id, startDate: new Date(), endDate: new Date(), reason: 'Personal' } as any);

    const hrOwn = await mk(hr.user._id);
    assert.equal((await request(app).put(`/api/v1/leaves/${hrOwn._id}/status`).set('Authorization', hr.token).send({ status: 'Approved' })).status, 403);

    const amyLeave = await mk(amy.user._id);
    assert.equal((await request(app).put(`/api/v1/leaves/${amyLeave._id}/status`).set('Authorization', hr.token).send({ status: 'Approved' })).status, 200);
    assert.equal((await request(app).put(`/api/v1/leaves/${amyLeave._id}/status`).set('Authorization', hr.token).send({ status: 'Rejected' })).status, 409);
    assert.equal((await request(app).post(`/api/v1/leaves/${amyLeave._id}/cancel`).set('Authorization', amy.token)).status, 404);
    assert.equal(await Notification.countDocuments({ tenantId: TENANT, audienceValue: amy.user._id, title: 'Leave approved' } as any), 1);

    const second = await mk(amy.user._id);
    assert.equal((await request(app).post(`/api/v1/leaves/${second._id}/cancel`).set('Authorization', hr.token)).status, 404);
    assert.equal((await request(app).post(`/api/v1/leaves/${second._id}/cancel`).set('Authorization', amy.token)).body.leaveRequest.status, 'Cancelled');
  });

  await t.test('expenses: no approving your own, valid transitions only, employees can withdraw pending', async () => {
    const amy = await createUser('amy');
    const fin = await createUser('fin', ['FINANCE_READ', 'FINANCE_WRITE']);
    const mk = (employeeId: unknown) => Expense.create({ tenantId: TENANT, employeeId, type: 'Travel', amount: 1200, date: new Date(), description: 'Cab' } as any);

    const own = await mk(fin.user._id);
    assert.equal((await request(app).put(`/api/v1/finance/expenses/${own._id}/status`).set('Authorization', fin.token).send({ status: 'Approved' })).status, 403);

    const claim = await mk(amy.user._id);
    assert.equal((await request(app).put(`/api/v1/finance/expenses/${claim._id}/status`).set('Authorization', fin.token).send({ status: 'Paid' })).status, 400);
    assert.equal((await request(app).put(`/api/v1/finance/expenses/${claim._id}/status`).set('Authorization', fin.token).send({ status: 'Reimbursed' })).status, 409);
    assert.equal((await request(app).put(`/api/v1/finance/expenses/${claim._id}/status`).set('Authorization', fin.token).send({ status: 'Approved' })).status, 200);
    assert.equal((await request(app).put(`/api/v1/finance/expenses/${claim._id}/status`).set('Authorization', fin.token).send({ status: 'Reimbursed' })).status, 200);
    assert.equal((await request(app).post(`/api/v1/finance/expenses/${claim._id}/withdraw`).set('Authorization', amy.token)).status, 404);

    const pending = await mk(amy.user._id);
    assert.equal((await request(app).post(`/api/v1/finance/expenses/${pending._id}/withdraw`).set('Authorization', amy.token)).body.expense.status, 'Withdrawn');
  });

  await t.test('my requests combines leave, claims and tickets on one status scale, only my own', async () => {
    const amy = await createUser('amy');
    const ben = await createUser('ben');
    const type = await LeaveType.create({ tenantId: TENANT, name: 'Sick', code: 'SL', defaultDays: 6 } as any);
    await LeaveRequest.create({ tenantId: TENANT, userId: amy.user._id, leaveTypeId: type._id, startDate: new Date(), endDate: moment2(), reason: 'Flu', status: 'Cancelled' } as any);
    await Expense.create({ tenantId: TENANT, employeeId: amy.user._id, type: 'Food', amount: 300, date: new Date(), description: 'Lunch', status: 'Reimbursed' } as any);
    await Expense.create({ tenantId: TENANT, employeeId: ben.user._id, type: 'Food', amount: 999, date: new Date(), description: 'Ben' } as any);
    await request(app).post('/api/v1/me/tickets').set('Authorization', amy.token).send({ department: 'IT', subject: 'Mouse broken', description: 'Left click' });

    const res = await request(app).get('/api/v1/me/requests').set('Authorization', amy.token);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.summary, { total: 3, inProgress: 1, approved: 1, rejected: 0, withdrawn: 1 });
    assert.equal(res.body.items.find((i: any) => i.kind === 'leave').title, 'Sick (2 days)');
    assert.ok(!JSON.stringify(res.body).includes('999'));
  });
});

function moment2() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

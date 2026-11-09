import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { app, connectTestDB, disconnectTestDB, clearTestDB, authHeader } from '../testUtils/setup';
import { User } from '../../models/User';
import { Role } from '../../models/Role';
import { SalarySlip } from '../../models/SalarySlip';
import { SalaryStructure } from '../../models/SalaryStructure';
import { Expense } from '../../models/Expense';
import { LeaveType } from '../../models/LeaveType';
import { signAccessToken } from '../../utils/authTokens';

// Phase 1C-2 — the endpoints behind the employee Payslip, Reimbursement and Leave pages.
//  - Salary slips and expenses were filtered with `req.user.role === 'Employee'`, a field
//    User doesn't have, so every employee could read the whole company's payroll.
//  - createExpense spread req.body, so a claim could be filed as already "Approved".
//  - applyLeave accepted any leave type id, invalid dates and overlapping requests.

const TENANT = new mongoose.Types.ObjectId().toString();

async function createUser(label: string, permissions: string[]) {
  const role = await new Role({ name: `${label} role`, permissions, tenantId: TENANT }).save();
  const user = await new User({
    email: `${label}@test.crewcam.app`,
    passwordHash: await bcrypt.hash('Sup3rSecret!', 4),
    firstName: label,
    lastName: 'User',
    roleId: role._id,
    tenantId: TENANT,
    isActive: true,
  }).save();
  return { user, token: signAccessToken(user) };
}

const slip = (employeeId: unknown, month: number): any => ({
  tenantId: TENANT, employeeId, month, year: 2026, totalEarnings: 50000, totalDeductions: 5000, netPay: 45000, status: 'Paid',
});

test('employee pay and leave endpoints', async (t) => {
  await connectTestDB();
  t.after(async () => {
    await disconnectTestDB();
  });
  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('an employee sees only their own salary slips; finance sees all', async () => {
    const alice = await createUser('alice', []);
    const bob = await createUser('bob', []);
    const finance = await createUser('fin', ['FINANCE_READ']);
    await SalarySlip.create([slip(alice.user._id, 1), slip(bob.user._id, 1), slip(bob.user._id, 2)]);

    const mine = await request(app).get('/api/v1/finance/salary-slips').set('Authorization', authHeader(alice.token));
    assert.equal(mine.status, 200);
    assert.equal(mine.body.length, 1, 'alice must not see bob\'s payslips');
    assert.equal(String(mine.body[0].employeeId._id), String(alice.user._id));

    const all = await request(app).get('/api/v1/finance/salary-slips').set('Authorization', authHeader(finance.token));
    assert.equal(all.body.length, 3);
  });

  await t.test('employees see only issued slips, never drafts', async () => {
    const alice = await createUser('alice', []);
    await SalarySlip.create([
      { ...slip(alice.user._id, 3), status: 'Draft' },
      { ...slip(alice.user._id, 4), status: 'Generated' },
      { ...slip(alice.user._id, 5), status: 'Paid' },
    ]);
    const res = await request(app).get('/api/v1/finance/salary-slips').set('Authorization', authHeader(alice.token));
    assert.deepEqual(res.body.map((s: any) => s.month).sort(), [4, 5]);
  });

  await t.test('GET /me/salary-structure returns only the caller\'s own pay', async () => {
    const alice = await createUser('alice', []);
    const bob = await createUser('bob', []);
    await SalaryStructure.create({ tenantId: TENANT, employeeId: alice.user._id, basic: 40000, hra: 16000, conveyance: 2000, specialAllowance: 12000, pfDeduction: 1800, esiDeduction: 0, taxDeduction: 5000 } as any);

    const mine = await request(app).get('/api/v1/me/salary-structure').set('Authorization', authHeader(alice.token));
    assert.equal(mine.status, 200);
    assert.equal(mine.body.data.monthlyGross, 70000);
    assert.equal(mine.body.data.monthlyNet, 63200);
    assert.equal(mine.body.data.annualGross, 840000);

    const bobs = await request(app).get('/api/v1/me/salary-structure').set('Authorization', authHeader(bob.token));
    assert.equal(bobs.body.data, null, 'bob has no structure and must not see alice\'s');
  });

  await t.test('an employee sees only their own expenses', async () => {
    const alice = await createUser('alice', []);
    const bob = await createUser('bob', []);
    await Expense.create({ tenantId: TENANT, employeeId: bob.user._id, type: 'Travel', amount: 900, date: new Date(), description: 'Cab' });

    const mine = await request(app).get('/api/v1/finance/expenses').set('Authorization', authHeader(alice.token));
    assert.equal(mine.status, 200);
    assert.equal(mine.body.length, 0);
  });

  await t.test('a claim cannot be self-approved or filed for someone else', async () => {
    const alice = await createUser('alice', []);
    const bob = await createUser('bob', []);

    const res = await request(app)
      .post('/api/v1/finance/expenses')
      .set('Authorization', authHeader(alice.token))
      .send({ type: 'Food', amount: 450, date: '2026-11-01', description: 'Client lunch', status: 'Approved', approverComments: 'ok', employeeId: bob.user._id });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.status, 'Pending');
    assert.equal(res.body.approverComments, undefined);
    assert.equal(String(res.body.employeeId), String(alice.user._id));

    const zero = await request(app).post('/api/v1/finance/expenses').set('Authorization', authHeader(alice.token))
      .send({ type: 'Food', amount: 0, date: '2026-11-01', description: 'x' });
    assert.equal(zero.status, 400);

    const badType = await request(app).post('/api/v1/finance/expenses').set('Authorization', authHeader(alice.token))
      .send({ type: 'Casino', amount: 10, date: '2026-11-01', description: 'x' });
    assert.equal(badType.status, 400);

    const future = await request(app).post('/api/v1/finance/expenses').set('Authorization', authHeader(alice.token))
      .send({ type: 'Food', amount: 10, date: '2099-01-01', description: 'x' });
    assert.equal(future.status, 400);

    const foreignReceipt = await request(app).post('/api/v1/finance/expenses').set('Authorization', authHeader(alice.token))
      .send({ type: 'Food', amount: 10, date: '2026-11-01', description: 'x', receiptUrl: 'https://evil.example/r.pdf' });
    assert.equal(foreignReceipt.status, 400);
  });

  await t.test('leave apply validates the type, the dates and overlaps', async () => {
    const alice = await createUser('alice', []);
    const casual = await LeaveType.create({ tenantId: TENANT, name: 'Casual Leave', code: 'CL', defaultDays: 12 });
    const otherCompanyType = await LeaveType.create({ tenantId: new mongoose.Types.ObjectId().toString(), name: 'CL', code: 'CL', defaultDays: 12 });
    const apply = (body: Record<string, unknown>) =>
      request(app).post('/api/v1/leaves/apply').set('Authorization', authHeader(alice.token)).send(body);

    const ok = await apply({ leaveTypeId: casual._id, startDate: '2026-12-01', endDate: '2026-12-03', reason: 'Family function' });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));

    assert.equal((await apply({ leaveTypeId: casual._id, startDate: '2026-12-03', endDate: '2026-12-04', reason: 'Overlap' })).status, 409);
    assert.equal((await apply({ leaveTypeId: otherCompanyType._id, startDate: '2027-01-05', endDate: '2027-01-05', reason: 'x' })).status, 400);
    assert.equal((await apply({ leaveTypeId: 'not-an-id', startDate: '2027-01-05', endDate: '2027-01-05', reason: 'x' })).status, 400);
    assert.equal((await apply({ leaveTypeId: casual._id, startDate: 'someday', endDate: '2027-01-05', reason: 'x' })).status, 400);
    assert.equal((await apply({ leaveTypeId: casual._id, startDate: '2027-01-06', endDate: '2027-01-05', reason: 'x' })).status, 400);

    // Adjacent, non-overlapping dates are fine.
    assert.equal((await apply({ leaveTypeId: casual._id, startDate: '2026-12-04', endDate: '2026-12-04', reason: 'Next day' })).status, 201);
  });

  await t.test('half days, contact details and attachments are validated and counted', async () => {
    const alice = await createUser('alice', []);
    const casual = await LeaveType.create({ tenantId: TENANT, name: 'Casual Leave', code: 'CL', defaultDays: 12 });
    const apply = (body: Record<string, unknown>) =>
      request(app).post('/api/v1/leaves/apply').set('Authorization', authHeader(alice.token))
        .send({ leaveTypeId: casual._id, reason: 'Appointment', ...body });

    assert.equal((await apply({ startDate: '2027-02-01', endDate: '2027-02-02', isHalfDay: true, halfDaySession: 'first' })).status, 400, 'half day spanning 2 days');
    assert.equal((await apply({ startDate: '2027-02-01', endDate: '2027-02-01', isHalfDay: true })).status, 400, 'half day without session');
    assert.equal((await apply({ startDate: '2027-02-01', endDate: '2027-02-01', contactNumber: 'call me' })).status, 400);
    assert.equal((await apply({ startDate: '2027-02-01', endDate: '2027-02-01', contactEmail: 'nope' })).status, 400);
    assert.equal((await apply({ startDate: '2027-02-01', endDate: '2027-02-01', attachmentUrl: 'https://evil.example/cert.pdf' })).status, 400);

    const ok = await apply({
      startDate: '2027-02-01', endDate: '2027-02-01', isHalfDay: true, halfDaySession: 'second',
      contactNumber: '9876543210', contactEmail: 'Alice@Mail.Test', attachmentUrl: 'http://localhost:8000/uploads/cert.pdf',
    });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.leaveRequest.isHalfDay, true);
    assert.equal(ok.body.leaveRequest.contactEmail, 'alice@mail.test');

    // Approve it directly, then the balance must drop by 0.5, not 1.
    await mongoose.connection.collection('leaverequests').updateOne({ _id: new mongoose.Types.ObjectId(ok.body.leaveRequest._id) }, { $set: { status: 'Approved', startDate: new Date(), endDate: new Date() } });
    const stats = await request(app).get('/api/v1/leaves/statistics').set('Authorization', authHeader(alice.token));
    const cl = stats.body.stats.find((s: any) => s.leaveTypeName === 'Casual Leave');
    assert.equal(cl.takenThisYear, 0.5);
    assert.equal(cl.balance, 11.5);
  });
});

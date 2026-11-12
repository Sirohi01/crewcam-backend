import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { app, connectTestDB, disconnectTestDB, clearTestDB, authHeader } from '../testUtils/setup';
import { User } from '../../models/User';
import { Role } from '../../models/Role';
import { BankPayrollInfo } from '../../models/BankPayrollInfo';
import { ProfileChangeRequest } from '../../models/ProfileChangeRequest';
import { decrypt } from '../../utils/encryption';
import { signAccessToken } from '../../utils/authTokens';

// Phase 1E — HR-approved changes to HR-owned profile data (identity and bank).

const TENANT = new mongoose.Types.ObjectId().toString();
const OTHER_TENANT = new mongoose.Types.ObjectId().toString();

async function createUser(label: string, permissions: string[], tenantId = TENANT, extra: Record<string, unknown> = {}) {
  const role = await new Role({ name: `${label} role`, permissions, tenantId }).save();
  const user = await new User({
    email: `${label}@test.crewcam.app`, passwordHash: await bcrypt.hash('Sup3rSecret!', 4),
    firstName: label, lastName: 'User', roleId: role._id, tenantId, isActive: true, ...extra,
  }).save();
  return { user, token: signAccessToken(user) };
}

const submit = (token: string, body: Record<string, unknown>) =>
  request(app).post('/api/v1/me/change-requests').set('Authorization', authHeader(token)).send(body);

test('profile change requests', async (t) => {
  await connectTestDB();
  t.after(async () => {
    await disconnectTestDB();
  });
  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('employee requests an identity change; HR approves; nothing applies before that', async () => {
    const emp = await createUser('emp', [], TENANT, { panNumber: 'AAAAA1111A' });
    const hr = await createUser('hr', ['EMPLOYEE_WRITE']);

    const created = await submit(emp.token, { kind: 'identity', changes: { panNumber: 'bbbbb2222b', firstName: 'Empy' }, comment: 'PAN corrected' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.proposedEncrypted, undefined, 'encrypted payload must not be returned');
    const pan = created.body.data.summary.find((s: any) => s.field === 'panNumber');
    assert.equal(pan.to, 'XXXXXX222B', 'sensitive values are masked in summaries');

    // Stored encrypted, not in clear.
    const raw = await mongoose.connection.collection('profilechangerequests').findOne({});
    assert.ok(!String(raw!.proposedEncrypted).includes('BBBBB2222B'));
    assert.equal(JSON.parse(decrypt(raw!.proposedEncrypted)).panNumber, 'BBBBB2222B');

    // Not applied yet.
    assert.equal((await User.findOne({ _id: emp.user._id, tenantId: TENANT }).lean())!.panNumber, 'AAAAA1111A');

    assert.equal((await submit(emp.token, { kind: 'identity', changes: { lastName: 'X' } })).status, 409, 'one pending per kind');

    const detail = await request(app).get(`/api/v1/change-requests/${created.body.data._id}`).set('Authorization', authHeader(hr.token));
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.proposed.panNumber, 'BBBBB2222B', 'the reviewer sees the full value to verify');

    const noReason = await request(app).put(`/api/v1/change-requests/${created.body.data._id}/review`).set('Authorization', authHeader(hr.token)).send({ decision: 'Rejected' });
    assert.equal(noReason.status, 400);

    const approved = await request(app).put(`/api/v1/change-requests/${created.body.data._id}/review`).set('Authorization', authHeader(hr.token)).send({ decision: 'Approved' });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    const after = await User.findOne({ _id: emp.user._id, tenantId: TENANT }).lean();
    assert.equal(after!.panNumber, 'BBBBB2222B');
    assert.equal(after!.firstName, 'Empy');

    const again = await request(app).put(`/api/v1/change-requests/${created.body.data._id}/review`).set('Authorization', authHeader(hr.token)).send({ decision: 'Approved' });
    assert.equal(again.status, 409, 'cannot review twice');
  });

  await t.test('validation: formats, disallowed fields, no-op requests, foreign attachments', async () => {
    const emp = await createUser('emp', [], TENANT, { firstName: 'Same' });
    assert.equal((await submit(emp.token, { kind: 'identity', changes: { panNumber: '1234' } })).status, 400);
    assert.equal((await submit(emp.token, { kind: 'identity', changes: { email: 'x@y.z' } })).status, 400, 'login email is not a requestable field');
    assert.equal((await submit(emp.token, { kind: 'identity', changes: { firstName: 'Same' } })).status, 400, 'nothing changes');
    assert.equal((await submit(emp.token, { kind: 'bank', changes: { ifscCode: 'BAD' } })).status, 400);
    assert.equal((await submit(emp.token, { kind: 'payroll', changes: {} })).status, 400);
    assert.equal((await submit(emp.token, { kind: 'identity', changes: { lastName: 'New' }, attachmentUrl: 'https://evil.example/x.pdf' })).status, 400);
  });

  await t.test('nobody reviews their own request; only HR can review; tenants are isolated', async () => {
    const hr = await createUser('hr', ['EMPLOYEE_WRITE']);
    const emp = await createUser('emp', []);
    const otherHr = await createUser('otherhr', ['EMPLOYEE_WRITE'], OTHER_TENANT);

    const own = await submit(hr.token, { kind: 'identity', changes: { lastName: 'Changed' } });
    assert.equal((await request(app).put(`/api/v1/change-requests/${own.body.data._id}/review`).set('Authorization', authHeader(hr.token)).send({ decision: 'Approved' })).status, 403);

    assert.equal((await request(app).get('/api/v1/change-requests').set('Authorization', authHeader(emp.token))).status, 403, 'employees cannot list');
    assert.equal((await request(app).get(`/api/v1/change-requests/${own.body.data._id}`).set('Authorization', authHeader(otherHr.token))).status, 404, 'other company');
    const otherList = await request(app).get('/api/v1/change-requests').set('Authorization', authHeader(otherHr.token));
    assert.equal(otherList.body.data.length, 0);
  });

  await t.test('bank change: needs an existing record; on approval the account is stored encrypted', async () => {
    const emp = await createUser('emp', []);
    const hr = await createUser('hr', ['EMPLOYEE_WRITE']);

    const first = await submit(emp.token, { kind: 'bank', changes: { accountNumber: '123456789012', ifscCode: 'hdfc0001234', bankName: 'HDFC Bank', accountHolderName: 'Emp User' } });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const noRecord = await request(app).put(`/api/v1/change-requests/${first.body.data._id}/review`).set('Authorization', authHeader(hr.token)).send({ decision: 'Approved' });
    assert.equal(noRecord.status, 409);
    assert.equal((await ProfileChangeRequest.findOne({ _id: first.body.data._id, tenantId: TENANT }).lean())!.status, 'Pending', 'still pending after a failed apply');

    await new BankPayrollInfo({ tenantId: TENANT, candidateId: new mongoose.Types.ObjectId(), employeeId: emp.user._id, bankName: 'SBI', accountHolderName: 'Emp User', accountNumber: '999988887777', ifscCode: 'SBIN0000001' } as any).save();
    const ok = await request(app).put(`/api/v1/change-requests/${first.body.data._id}/review`).set('Authorization', authHeader(hr.token)).send({ decision: 'Approved', comment: 'Cheque verified' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));

    const raw = await mongoose.connection.collection('bankpayrollinfos').findOne({});
    assert.notEqual(raw!.accountNumber, '123456789012', 'account number must be stored encrypted');
    assert.equal(decrypt(raw!.accountNumber), '123456789012');
    assert.equal(raw!.ifscCode, 'HDFC0001234');
    assert.equal(raw!.status, 'Verified');
  });

  await t.test('employee can cancel only their own pending request', async () => {
    const emp = await createUser('emp', []);
    const other = await createUser('other', []);
    const created = await submit(emp.token, { kind: 'identity', changes: { lastName: 'New' } });
    assert.equal((await request(app).post(`/api/v1/me/change-requests/${created.body.data._id}/cancel`).set('Authorization', authHeader(other.token))).status, 404);
    assert.equal((await request(app).post(`/api/v1/me/change-requests/${created.body.data._id}/cancel`).set('Authorization', authHeader(emp.token))).status, 200);
    const mine = await request(app).get('/api/v1/me/change-requests').set('Authorization', authHeader(emp.token));
    assert.equal(mine.body.data[0].status, 'Cancelled');
  });
});

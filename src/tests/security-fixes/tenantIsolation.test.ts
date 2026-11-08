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
import { Department } from '../../models/Department';
import BusinessUnit from '../../models/BusinessUnit';
import BudgetAllocation from '../../models/BudgetAllocation';
import TeamMember from '../../models/TeamMember';
import { signAccessToken } from '../../utils/authTokens';
import { escapeRegex, toSearchPattern } from '../../utils/regex';
import { TEST_PUBLISH_KEY_HEADER, getTestPublishKey } from '../../middleware/testPublishGuard';

// Regression coverage for Phase 0 tenant-isolation hardening:
//  - TeamMember was scoped only by sub-department *name*, so two companies with a
//    same-named sub-department could list/edit/delete each other's members.
//  - BusinessUnit get/update/delete looked records up by _id alone.
//  - The budget-allocation list returned every company's budgets.
//  - tenantResolver honoured a client-supplied x-tenant-id header.
//  - The tenant plugin did not guard aggregate(), and let an update body re-home a
//    record into another tenant.
//  - Search input reached $regex unescaped (ReDoS / 500 on invalid patterns).

async function createTenantUser(label: string, permissions: string[] = ['*']) {
  const pkg = await new Package({ name: `${label} package`, maxUsers: 50, features: ['*'], isActive: true }).save();
  const tenant = await new Tenant({ name: `${label} Pvt Ltd`, packageId: pkg._id }).save();
  const tenantId = String(tenant._id);

  const role = await new Role({ name: `${label} role`, permissions, tenantId }).save();
  const user = await new User({
    email: `${label.toLowerCase()}-${permissions.length}@test.crewcam.app`,
    passwordHash: await bcrypt.hash('Sup3rSecret!', 4),
    firstName: label,
    lastName: 'User',
    roleId: role._id,
    tenantId,
    isActive: true,
  }).save();

  return { tenantId, user, token: signAccessToken(user) };
}

const teamMemberBody = (employeeId: string) => ({
  firstName: 'Asha',
  lastName: 'Rao',
  employeeId,
  designation: 'Designer',
  role: 'Member',
  email: `${employeeId.toLowerCase()}@example.com`,
  mobile: '9000000000',
});

test('regex helpers neutralise user input', () => {
  assert.equal(escapeRegex('(a+)+$'), '\\(a\\+\\)\\+\\$');
  assert.equal(toSearchPattern('  a.b  '), 'a\\.b');
  assert.equal(toSearchPattern(['first', 'second']), 'first');
  assert.equal(toSearchPattern(undefined), '');
  assert.equal(toSearchPattern('x'.repeat(500)).length, 100);
  // The escaped pattern must compile and match only the literal text.
  assert.ok(new RegExp(toSearchPattern('(')).test('a(b'));
});

test('tenant isolation', async (t) => {
  await connectTestDB();
  t.after(async () => {
    await disconnectTestDB();
  });
  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('aggregate() without a leading tenant $match is rejected', async () => {
    await assert.rejects(
      () => TeamMember.aggregate([{ $group: { _id: '$subDepartment' } }]),
      /Tenant isolation violation/,
    );
    const tenantId = new mongoose.Types.ObjectId();
    const rows = await TeamMember.aggregate([{ $match: { tenantId } }, { $count: 'n' }]);
    assert.deepEqual(rows, []);
  });

  await t.test('an update body cannot move a record into another tenant', async () => {
    const tenantA = new mongoose.Types.ObjectId();
    const tenantB = new mongoose.Types.ObjectId();
    const bu = await new BusinessUnit({ tenantId: tenantA, name: 'Retail', code: 'RT' }).save();

    await BusinessUnit.updateOne({ _id: bu._id, tenantId: tenantA }, { $set: { tenantId: tenantB, name: 'Renamed' } });

    const after = await BusinessUnit.findOne({ _id: bu._id, tenantId: tenantA }).lean();
    assert.ok(after, 'record must still belong to tenant A');
    assert.equal(after!.name, 'Renamed');
  });

  await t.test('team members are invisible across tenants sharing a sub-department name', async () => {
    const a = await createTenantUser('Alpha');
    const b = await createTenantUser('Beta');

    const created = await request(app)
      .post('/api/v1/sub-departments/design/team-members')
      .set('Authorization', authHeader(a.token))
      .send(teamMemberBody('E001'));
    assert.equal(created.status, 201);
    const memberId = created.body.data._id;

    const listB = await request(app)
      .get('/api/v1/sub-departments/design/team-members')
      .set('Authorization', authHeader(b.token))
      .set('x-tenant-id', a.tenantId); // spoofed header must be ignored
    assert.equal(listB.status, 200);
    assert.equal(listB.body.pagination.total, 0);

    const getB = await request(app)
      .get(`/api/v1/sub-departments/design/team-members/${memberId}`)
      .set('Authorization', authHeader(b.token));
    assert.equal(getB.status, 404);

    const delB = await request(app)
      .delete(`/api/v1/sub-departments/design/team-members/${memberId}`)
      .set('Authorization', authHeader(b.token));
    assert.equal(delB.status, 404);

    // The duplicate check is per tenant, so B can reuse A's employee ID.
    const createB = await request(app)
      .post('/api/v1/sub-departments/design/team-members')
      .set('Authorization', authHeader(b.token))
      .send(teamMemberBody('E001'));
    assert.equal(createB.status, 201);

    const listA = await request(app)
      .get('/api/v1/sub-departments/design/team-members')
      .set('Authorization', authHeader(a.token));
    assert.equal(listA.body.pagination.total, 1);
  });

  await t.test('team member routes require authentication', async () => {
    const res = await request(app).get('/api/v1/sub-departments/design/team-members');
    assert.equal(res.status, 401);
  });

  await t.test('business units cannot be read, edited or deleted by another tenant', async () => {
    const a = await createTenantUser('Alpha');
    const b = await createTenantUser('Beta');
    const bu = await new BusinessUnit({ tenantId: a.tenantId, name: 'Retail', code: 'RT' }).save();

    const getB = await request(app).get(`/api/v1/business-units/${bu._id}`).set('Authorization', authHeader(b.token));
    assert.equal(getB.status, 404);

    const putB = await request(app)
      .put(`/api/v1/business-units/${bu._id}`)
      .set('Authorization', authHeader(b.token))
      .send({ name: 'Hijacked' });
    assert.equal(putB.status, 404);

    const delB = await request(app).delete(`/api/v1/business-units/${bu._id}`).set('Authorization', authHeader(b.token));
    assert.equal(delB.status, 404);

    const getA = await request(app).get(`/api/v1/business-units/${bu._id}`).set('Authorization', authHeader(a.token));
    assert.equal(getA.status, 200);
    assert.equal(getA.body.data.name, 'Retail');
  });

  await t.test('business unit writes require ORG_WRITE', async () => {
    const reader = await createTenantUser('Reader', ['ORG_READ']);
    const res = await request(app)
      .post('/api/v1/business-units')
      .set('Authorization', authHeader(reader.token))
      .send({ name: 'Retail', code: 'RT' });
    assert.equal(res.status, 403);
  });

  await t.test('budget allocations are scoped to the caller’s departments', async () => {
    const a = await createTenantUser('Alpha');
    const b = await createTenantUser('Beta');
    const deptA = await new Department({
      tenantId: a.tenantId,
      name: 'Design',
      code: 'DSN',
      branchId: new mongoose.Types.ObjectId(),
    }).save();
    await new BudgetAllocation({ departmentId: deptA._id, financialYear: '2026-27', budgetOwnerId: a.user._id }).save();

    const byDeptA = await request(app)
      .get(`/api/v1/companies/departments/${deptA._id}/budget-allocations`)
      .query({ financialYear: '2026-27' })
      .set('Authorization', authHeader(a.token));
    assert.equal(byDeptA.status, 200, JSON.stringify(byDeptA.body));
    assert.equal(byDeptA.body.data.budgetOwnerId.firstName, 'Alpha');

    const byDeptB = await request(app)
      .get(`/api/v1/companies/departments/${deptA._id}/budget-allocations`)
      .query({ financialYear: '2026-27' })
      .set('Authorization', authHeader(b.token));
    assert.equal(byDeptB.status, 404);

    const createB = await request(app)
      .post('/api/v1/companies/departments/budget-allocations')
      .set('Authorization', authHeader(b.token))
      .send({ departmentId: String(deptA._id), financialYear: '2027-28', budgetHeads: [{ head: 'Travel', annual: 1 }] });
    assert.equal(createB.status, 404);

    // B's attempted upsert must not have touched A's department.
    const allocationsA = await BudgetAllocation.countDocuments({ departmentId: deptA._id });
    assert.equal(allocationsA, 1);
  });

  await t.test('test-publish mock endpoints require the server-derived key', async () => {
    const anonymous = await request(app).get('/api/v1/test-publish/postings');
    assert.equal(anonymous.status, 401);

    const forged = await request(app).get('/api/v1/test-publish/postings').set(TEST_PUBLISH_KEY_HEADER, 'guess');
    assert.equal(forged.status, 401);

    const internal = await request(app).get('/api/v1/test-publish/postings').set(TEST_PUBLISH_KEY_HEADER, getTestPublishKey());
    assert.equal(internal.status, 200);
  });

  await t.test('search tolerates regex metacharacters', async () => {
    const a = await createTenantUser('Alpha');
    // Unescaped, '((((' is an invalid pattern and MongoDB rejects the query with a 500.
    const res = await request(app)
      .get('/api/v1/companies/branches')
      .query({ search: '((((' })
      .set('Authorization', authHeader(a.token));
    assert.equal(res.status, 200);
  });
});

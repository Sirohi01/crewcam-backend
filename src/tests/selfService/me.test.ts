import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import { app, connectTestDB, disconnectTestDB, clearTestDB, authHeader } from '../testUtils/setup';
import { User } from '../../models/User';
import { Role } from '../../models/Role';
import { Tenant } from '../../models/Tenant';
import { Package } from '../../models/Package';
import { EmployeeProfileDetail } from '../../models/EmployeeProfileDetail';
import { signAccessToken } from '../../utils/authTokens';

// Phase 1 — employee self-service (/api/v1/me) plus the 2FA-secret leak found while
// building it: every employee endpoint returned twoFactorSecret.

const PASSWORD = 'Sup3rSecret!';
let TENANT_A = '';
let TENANT_B = '';

/** Real Tenant + active package, so routes behind requireFeature('Core HR') resolve. */
async function createTenant(name: string) {
  const pkg = await new Package({ name: `${name} plan`, maxUsers: 50, features: ['*'], isActive: true }).save();
  const tenant = await new Tenant({ name, packageId: pkg._id }).save();
  return String(tenant._id);
}

async function createEmployee(tenantId: string, label: string, extra: Record<string, unknown> = {}) {
  const role = await new Role({ name: `${label} role`, permissions: ['*'], tenantId }).save();
  const user = await new User({
    email: `${label}@test.crewcam.app`,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    firstName: label,
    lastName: 'Employee',
    roleId: role._id,
    tenantId,
    isActive: true,
    panNumber: 'ABCDE1234F',
    ...extra,
  }).save();
  return { user, token: signAccessToken(user) };
}

test('employee self-service', async (t) => {
  await connectTestDB();
  t.after(async () => {
    await disconnectTestDB();
  });
  t.beforeEach(async () => {
    TENANT_A = await createTenant('Alpha Pvt Ltd');
    TENANT_B = await createTenant('Beta Pvt Ltd');
  });
  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('2FA secret is never returned by employee endpoints', async () => {
    const { user, token } = await createEmployee(TENANT_A, 'alice', { twoFactorEnabled: true, twoFactorSecret: 'JBSWY3DPEHPK3PXP' });

    for (const path of ['/api/v1/employees/current', '/api/v1/employees', `/api/v1/employees/${user._id}`, '/api/v1/me/profile']) {
      const res = await request(app).get(path).set('Authorization', authHeader(token));
      assert.equal(res.status, 200, path);
      assert.ok(!JSON.stringify(res.body).includes('JBSWY3DPEHPK3PXP'), `${path} leaked twoFactorSecret`);
      assert.ok(!JSON.stringify(res.body).includes('passwordHash'), `${path} leaked passwordHash`);
    }
  });

  await t.test('2FA login still verifies codes with the secret hidden by default', async () => {
    const secret = speakeasy.generateSecret().base32;
    await createEmployee(TENANT_A, 'bob', { twoFactorEnabled: true, twoFactorSecret: secret });

    const good = await request(app)
      .post('/api/v1/auth/login/2fa')
      .send({ email: 'bob@test.crewcam.app', password: PASSWORD, token: speakeasy.totp({ secret, encoding: 'base32' }) });
    assert.equal(good.status, 200, JSON.stringify(good.body));

    const bad = await request(app)
      .post('/api/v1/auth/login/2fa')
      .send({ email: 'bob@test.crewcam.app', password: PASSWORD, token: '000000' });
    assert.equal(bad.status, 401);
  });

  await t.test('GET /me/profile masks statutory IDs', async () => {
    const { token } = await createEmployee(TENANT_A, 'carol');
    const res = await request(app).get('/api/v1/me/profile').set('Authorization', authHeader(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.panNumber, 'XXXXXX234F');
    assert.equal(res.body.data.firstName, 'carol');
  });

  await t.test('PATCH /me/profile updates self-editable fields only', async () => {
    const { user, token } = await createEmployee(TENANT_A, 'dave');

    const ok = await request(app)
      .patch('/api/v1/me/profile')
      .set('Authorization', authHeader(token))
      .send({ mobileNumber: '+91 98765 43210', currentCity: 'Noida', bloodGroup: 'B+' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.currentCity, 'Noida');

    for (const forbidden of [{ firstName: 'Mallory' }, { email: 'x@evil.test' }, { tenantId: TENANT_B }, { roleId: user.roleId }, { panNumber: 'ZZZZZ9999Z' }]) {
      const res = await request(app).patch('/api/v1/me/profile').set('Authorization', authHeader(token)).send(forbidden);
      assert.equal(res.status, 400, `should reject ${Object.keys(forbidden)[0]}`);
    }

    const after = await User.findOne({ _id: user._id, tenantId: TENANT_A }).lean();
    assert.equal(after!.firstName, 'dave');
    assert.equal(after!.tenantId, TENANT_A);

    const badPhone = await request(app).patch('/api/v1/me/profile').set('Authorization', authHeader(token)).send({ mobileNumber: 'call me' });
    assert.equal(badPhone.status, 400);
  });

  await t.test('profile sections save, validate and stay private', async () => {
    const a = await createEmployee(TENANT_A, 'erin');
    const b = await createEmployee(TENANT_A, 'frank');

    const saved = await request(app)
      .put('/api/v1/me/details/familyMembers')
      .set('Authorization', authHeader(a.token))
      .send({ familyMembers: [{ name: 'Neha', relationship: 'Sister', dateOfBirth: '1993-02-18', isDependent: true, email: '' }] });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.data.familyMembers.length, 1);
    assert.ok(saved.body.data.familyMembers[0]._id, 'rows get ids for edit/delete');

    const missingName = await request(app)
      .put('/api/v1/me/details/familyMembers')
      .set('Authorization', authHeader(a.token))
      .send({ familyMembers: [{ relationship: 'Sister' }] });
    assert.equal(missingName.status, 400);
    assert.match(missingName.body.message, /name/);

    const tooMany = await request(app)
      .put('/api/v1/me/details/skills')
      .set('Authorization', authHeader(a.token))
      .send({ skills: Array.from({ length: 26 }, (_, i) => ({ name: `Skill ${i}` })) });
    assert.equal(tooMany.status, 400);

    const badDates = await request(app)
      .put('/api/v1/me/details/experience')
      .set('Authorization', authHeader(a.token))
      .send({ experience: [{ company: 'Acme', designation: 'Dev', startDate: '2024-01-01', endDate: '2023-01-01' }] });
    assert.equal(badDates.status, 400);

    const twoPrimaries = await request(app)
      .put('/api/v1/me/details/emergencyContacts')
      .set('Authorization', authHeader(a.token))
      .send({ emergencyContacts: [
        { name: 'Raj', relationship: 'Father', mobile: '9811011222', isPrimary: true },
        { name: 'Neha', relationship: 'Sister', mobile: '9876512345', isPrimary: true },
      ] });
    assert.equal(twoPrimaries.status, 400);

    const unknown = await request(app).put('/api/v1/me/details/salary').set('Authorization', authHeader(a.token)).send({});
    assert.equal(unknown.status, 404);

    // Another employee (same company) sees only their own, empty, details.
    const other = await request(app).get('/api/v1/me/details').set('Authorization', authHeader(b.token));
    assert.equal(other.status, 200);
    assert.equal(other.body.data.familyMembers.length, 0);

    assert.equal(await EmployeeProfileDetail.countDocuments({ tenantId: TENANT_A }), 1);
  });

  await t.test('onboarding emergency contact is shown until the employee edits the list', async () => {
    const { token } = await createEmployee(TENANT_B, 'gina', {
      emergencyContactName: 'Rajesh',
      emergencyContactRelation: 'Father',
      emergencyContactNumber: '9811011222',
    });
    const res = await request(app).get('/api/v1/me/details').set('Authorization', authHeader(token));
    assert.equal(res.body.data.emergencyContacts.length, 1);
    assert.equal(res.body.data.emergencyContacts[0].name, 'Rajesh');
    assert.equal(res.body.data.emergencyContacts[0].isPrimary, true);
  });

  await t.test('/me requires authentication', async () => {
    assert.equal((await request(app).get('/api/v1/me/profile')).status, 401);
    assert.equal((await request(app).get('/api/v1/me/bank')).status, 401);
  });
});

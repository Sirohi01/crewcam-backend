import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app, connectTestDB, disconnectTestDB, clearTestDB, authHeader } from '../testUtils/setup';
import { User } from '../../models/User';
import { Role } from '../../models/Role';
import { signAccessToken } from '../../utils/authTokens';

// Regression coverage for: a hardcoded `user.email === 'admin@crewcam.app'`
// super-admin bypass duplicated across authController.ts (x4) and rbac.ts (x1).
// Anyone whose account happened to use (or could register) that exact email got
// super-admin rights regardless of their actual role/tenantId. The fix removes
// the email check entirely — only a real SUPER_ADMIN role permission or the
// SUPER_ADMIN tenantId sentinel should grant access.

const BACKDOOR_EMAIL = 'admin@crewcam.app';
const REGULAR_TENANT_ID = 'tenant_regular_test';

async function createRegularUserWithBackdoorEmail() {
  const role = await new Role({
    name: 'Employee',
    description: 'Ordinary tenant role, no admin permissions',
    permissions: ['ORG_READ'],
    tenantId: REGULAR_TENANT_ID,
  }).save();

  const passwordHash = await bcrypt.hash('Sup3rSecret!', 10);
  const user = await new User({
    email: BACKDOOR_EMAIL,
    passwordHash,
    firstName: 'Suspicious',
    lastName: 'Account',
    roleId: role._id,
    tenantId: REGULAR_TENANT_ID,
    isActive: true,
  }).save();

  const token = signAccessToken(user);
  return { user, role, token };
}

test('user.email === "admin@crewcam.app" no longer bypasses RBAC', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('a regular (non-super-admin) user with the old backdoor email is rejected', async () => {
    const { token } = await createRegularUserWithBackdoorEmail();

    const res = await request(app)
      .get('/api/v1/super-admin/tenants')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 403);
  });

  await t.test('a legitimate super admin (real role permission) is still allowed', async () => {
    const role = await new Role({
      name: 'Super Admin',
      description: 'Global system administrator',
      permissions: ['SUPER_ADMIN'],
      tenantId: 'SUPER_ADMIN',
    }).save();

    const passwordHash = await bcrypt.hash('Sup3rSecret!', 10);
    const user = await new User({
      email: 'legit-super-admin@test.crewcam.app',
      passwordHash,
      firstName: 'Legit',
      lastName: 'Admin',
      roleId: role._id,
      tenantId: 'SUPER_ADMIN',
      isActive: true,
    }).save();

    const token = signAccessToken(user);
    const res = await request(app)
      .get('/api/v1/super-admin/tenants')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
  });
});

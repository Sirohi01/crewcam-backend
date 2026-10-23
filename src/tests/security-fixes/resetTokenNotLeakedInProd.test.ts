import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app, connectTestDB, disconnectTestDB, clearTestDB } from '../testUtils/setup';
import { User } from '../../models/User';
import { Tenant } from '../../models/Tenant';

// Regression coverage for: forgotPassword() returned the raw password-reset
// token in the JSON response whenever `NODE_ENV !== 'production'` (an exact
// string match). Any staging/QA deployment, or any deployment where NODE_ENV is
// simply unset or misspelled, handed out a working reset token to anyone who
// submitted a known email — full account takeover without inbox access.
// The fix (isDevEnvironment(), src/utils/env.ts) flips this to an allowlist:
// the token is only ever included when NODE_ENV is explicitly 'development' or
// 'test'; everything else (including unset/misconfigured) hides it.

async function seedUser(email: string) {
  const tenant = await new Tenant({ name: 'Reset Token Test Co', lifecycleStatus: 'ACTIVE' }).save();
  const passwordHash = await bcrypt.hash('Sup3rSecret!1', 10);
  await new User({
    email,
    passwordHash,
    firstName: 'Reset',
    lastName: 'Target',
    tenantId: tenant._id.toString(),
    isActive: true,
  }).save();
}

test('POST /auth/forgot-password', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('does NOT include the reset token when NODE_ENV is production', async () => {
    await seedUser('reset-target-prod@test.crewcam.app');
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'reset-target-prod@test.crewcam.app' });

      assert.equal(res.status, 200);
      assert.equal(res.body.resetToken, undefined, 'resetToken must never leak when NODE_ENV=production');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  await t.test('includes the reset token in test/dev for testability', async () => {
    await seedUser('reset-target-dev@test.crewcam.app');
    // testUtils/setup.ts already forces NODE_ENV='test' for this process.
    assert.equal(process.env.NODE_ENV, 'test');

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'reset-target-dev@test.crewcam.app' });

    assert.equal(res.status, 200);
    assert.ok(res.body.resetToken, 'expected resetToken to be present in test env');
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app, connectTestDB, disconnectTestDB, clearTestDB } from '../testUtils/setup';
import { User } from '../../models/User';
import { Tenant } from '../../models/Tenant';

// Regression coverage for: issueSession() (authController.ts) returned the raw
// JWT in the JSON response body (`...sessionResponse` spreads a `token` field)
// in addition to setting it as an httpOnly cookie — defeating the point of
// httpOnly, since anything that can read the response (XSS, response logging)
// could just take the token from there instead. The fix stops returning `token`
// in the body; the cookie remains the only place the access token lives.
//
// NOTE: every request in this file counts against authRoutes' per-process
// 10-requests/15-minutes rate limiter (middleware/rateLimiter.ts, which only
// skips NODE_ENV === 'development', not 'test') — keep this file's total
// /api/v1/auth/* request count low.

const PASSWORD = 'Sup3rSecret!1';

test('POST /auth/login', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('response body never contains the access token; it is only set as an httpOnly cookie', async () => {
    const tenant = await new Tenant({ name: 'Acme Test Co', lifecycleStatus: 'ACTIVE' }).save();
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await new User({
      email: 'employee@acme-test.crewcam.app',
      passwordHash,
      firstName: 'Test',
      lastName: 'Employee',
      tenantId: tenant._id.toString(),
      isActive: true,
    }).save();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'employee@acme-test.crewcam.app', password: PASSWORD });

    assert.equal(res.status, 200);
    assert.equal(res.body.token, undefined, 'login response body must not contain a raw token');
    assert.equal(res.body.user.email, 'employee@acme-test.crewcam.app');

    const setCookieHeader = res.headers['set-cookie'];
    assert.ok(setCookieHeader, 'expected Set-Cookie header on successful login');
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    const tokenCookie = cookies.find((c: string) => c.startsWith('token_employer='));
    assert.ok(tokenCookie, 'expected token_employer cookie to be set');
    assert.match(tokenCookie, /HttpOnly/i);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB } from '../testUtils/setup';

// Regression coverage for: POST /api/v1/auth/2fa/setup was never registered in
// authRoutes.ts even though the setup2FA controller existed and the frontend
// settings page called it — every request 404'd. Discovered while fixing the
// frontend security-settings page to stop relying on the (always-null)
// authStore.token. The fix wires `router.post('/2fa/setup', authenticate, setup2FA)`.

test('POST /auth/2fa/setup is routed (not a 404) and requires authentication', async (t) => {
  await connectTestDB();
  t.after(async () => {
    await disconnectTestDB();
  });

  const res = await request(app).post('/api/v1/auth/2fa/setup');

  // Must be rejected for lack of auth (401), never 404 — a 404 would mean the
  // route still isn't registered.
  assert.equal(res.status, 401);
});

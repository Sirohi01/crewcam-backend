import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../testUtils/setup';

// Regression coverage for: permissive CORS that reflected any Origin with
// credentials: true (src/app.ts). The fix wires the pre-existing isAllowedOrigin()
// allowlist into the actual cors() middleware instead of unconditionally
// reflecting whatever Origin header the client sent.

test('CORS does not reflect an arbitrary untrusted origin', async () => {
  const res = await request(app)
    .get('/api/health')
    .set('Origin', 'https://evil-attacker.example');

  // An allowed request gets `Access-Control-Allow-Origin` echoing the request's
  // Origin back. A blocked request must NOT carry that origin in the header —
  // if it did, any website could read authenticated responses from a victim's browser.
  assert.notEqual(res.headers['access-control-allow-origin'], 'https://evil-attacker.example');
});

test('CORS allows the configured default origin', async () => {
  // CORS_ORIGIN defaults to http://localhost:3000 when unset (see app.ts).
  const res = await request(app)
    .get('/api/health')
    .set('Origin', 'http://localhost:3000');

  assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:3000');
  assert.equal(res.headers['access-control-allow-credentials'], 'true');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { getJwtSecret } from '../../utils/authTokens';

// Regression coverage for: a hardcoded fallback JWT secret
// ('development_secret_change_me') used whenever JWT_SECRET was unset outside
// production. Anyone who read the source could forge SUPER_ADMIN tokens against
// any deployment that forgot to set JWT_SECRET. The fix (src/utils/authTokens.ts)
// throws outside dev/test, and generates a random per-process secret in dev/test
// instead of using a fixed string.

test('getJwtSecret never falls back to the old hardcoded string', () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalEnv = process.env.NODE_ENV;
  delete process.env.JWT_SECRET;
  process.env.NODE_ENV = 'development';
  try {
    const secret = getJwtSecret();
    assert.notEqual(secret, 'development_secret_change_me');
    assert.notEqual(secret, 'test_secret');
    // crypto.randomBytes(32).toString('hex') -> 64 hex chars; a real random secret,
    // not a short/guessable literal.
    assert.ok(secret.length >= 32, `expected a long random secret, got "${secret}"`);
  } finally {
    if (originalSecret) process.env.JWT_SECRET = originalSecret;
    process.env.NODE_ENV = originalEnv;
  }
});

test('getJwtSecret is stable within a process when unset (same dev secret reused)', () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalEnv = process.env.NODE_ENV;
  delete process.env.JWT_SECRET;
  process.env.NODE_ENV = 'development';
  try {
    const first = getJwtSecret();
    const second = getJwtSecret();
    assert.equal(first, second);
  } finally {
    if (originalSecret) process.env.JWT_SECRET = originalSecret;
    process.env.NODE_ENV = originalEnv;
  }
});

test('getJwtSecret throws when unset outside development/test (simulated production)', () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalEnv = process.env.NODE_ENV;
  delete process.env.JWT_SECRET;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(() => getJwtSecret(), /JWT_SECRET is required/);
  } finally {
    if (originalSecret) process.env.JWT_SECRET = originalSecret;
    process.env.NODE_ENV = originalEnv;
  }
});

test('getJwtSecret returns the configured secret when JWT_SECRET is set', () => {
  const original = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'explicit_configured_secret';
  try {
    assert.equal(getJwtSecret(), 'explicit_configured_secret');
  } finally {
    if (original) process.env.JWT_SECRET = original;
    else delete process.env.JWT_SECRET;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createOpaqueToken, getJwtSecret, hashToken, signAccessToken } from '../utils/authTokens';

test('opaque tokens are random and hash consistently', () => {
  const first = createOpaqueToken();
  const second = createOpaqueToken();

  assert.notEqual(first, second);
  assert.equal(hashToken(first), hashToken(first));
  assert.notEqual(hashToken(first), first);
});

test('access token is signed with configured JWT secret', () => {
  process.env.JWT_SECRET = 'phase_1_test_secret';
  const user = {
    _id: '507f1f77bcf86cd799439011',
    email: 'admin@example.com',
    roleId: '507f1f77bcf86cd799439012',
    tenantId: '507f1f77bcf86cd799439013',
  } as any;

  const token = signAccessToken(user);
  const decoded = jwt.verify(token, getJwtSecret()) as any;

  assert.equal(decoded.email, user.email);
  assert.equal(decoded.tenantId, user.tenantId);
});

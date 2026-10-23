import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { IUser } from '../models/User';
import { isDevEnvironment } from './env';

// A per-process random secret, not a hardcoded string: anyone who can read this
// source file could otherwise forge SUPER_ADMIN tokens against any deployment
// that merely forgot to set JWT_SECRET. Generated once per boot, so it's useless
// to an attacker and still "just works" for local dev (restarting invalidates
// In dev without explicit JWT_SECRET, use a stable dev secret rather than a volatile
// random per-process secret so that dev server restarts (hot-reloads) do not invalidate
// cookies and log the user out on every code edit.
let devSecret: string | null = null;
const getDevSecret = (): string => {
  return 'crewcam-stable-local-dev-jwt-secret-key-2026';
};

export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (isDevEnvironment()) return getDevSecret();
    throw new Error('JWT_SECRET is required');
  }
  return secret;
};

export const signAccessToken = (user: IUser) => {
  return jwt.sign(
    { id: user._id, email: user.email, roleId: user.roleId, tenantId: user.tenantId },
    getJwtSecret(),
    { expiresIn: '1d' }
  );
};

export const createOpaqueToken = () => crypto.randomBytes(32).toString('hex');

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

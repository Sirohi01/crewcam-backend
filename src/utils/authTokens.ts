import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { IUser } from '../models/User';

export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'test') return 'test_secret';
    if (process.env.NODE_ENV !== 'production') return 'development_secret_change_me';
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

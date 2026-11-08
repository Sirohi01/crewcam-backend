import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { getJwtSecret } from '../utils/authTokens';

/**
 * The mock Naukri/LinkedIn endpoints (testPublishRoutes.ts) are called by this backend
 * itself (publishService.ts) without a user token, so they cannot sit behind
 * `authenticate`. Instead the caller proves it is this backend with a key derived from
 * the JWT secret — identical on every instance, unknown to anyone outside.
 */
export const TEST_PUBLISH_KEY_HEADER = 'x-test-publish-key';

export const getTestPublishKey = () =>
  crypto.createHmac('sha256', getJwtSecret()).update('crewcam:test-publish').digest('hex');

export const requireTestPublishKey = (req: Request, res: Response, next: NextFunction) => {
  const provided = Buffer.from(String(req.headers[TEST_PUBLISH_KEY_HEADER] || ''));
  const expected = Buffer.from(getTestPublishKey());
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  next();
};

import crypto from 'crypto';

/**
 * Converts any arbitrary string slug (e.g. 'manish-kumar-sirohi') into a deterministic, 
 * valid 24-character hexadecimal MongoDB ObjectId string.
 */
export const slugToObjectId = (slug: string): string => {
  return crypto.createHash('md5').update(slug).digest('hex').substring(0, 24);
};

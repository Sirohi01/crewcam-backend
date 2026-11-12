import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ALGORITHM = 'aes-256-gcm';

/**
 * Key used before ENCRYPTION_KEY was required. It is public (it lives in this file), so
 * anything still encrypted with it is effectively unprotected. It is kept only as a
 * *decrypt* fallback so existing records stay readable after a real key is configured;
 * run scripts/reencryptSensitiveData.ts to move them onto the configured key.
 */
const LEGACY_DEFAULT_KEY = 'default_secret_key_32_chars_long';

const configuredKey = process.env.ENCRYPTION_KEY;
if (configuredKey && Buffer.byteLength(configuredKey, 'utf8') !== 32) {
  throw new Error('ENCRYPTION_KEY must be exactly 32 bytes (32 ASCII characters)');
}
if (!configuredKey && process.env.NODE_ENV === 'production') {
  console.error('[SECURITY] ENCRYPTION_KEY is not set: bank account, PAN and Aadhaar data is being encrypted with a public fallback key. Set ENCRYPTION_KEY and run scripts/reencryptSensitiveData.ts.');
}

// Must be a 32-character string (256 bits)
const ENCRYPTION_KEY = configuredKey || LEGACY_DEFAULT_KEY;

/** True when no ENCRYPTION_KEY is configured (data is protected only by the public key). */
export const isUsingLegacyKey = () => ENCRYPTION_KEY === LEGACY_DEFAULT_KEY;

export const encrypt = (text: string): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  // Format: iv:authTag:encryptedText
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

const decryptWith = (key: string, encryptedText: string): string => {
  const [ivHex, authTagHex, encryptedHex] = encryptedText.split(':');

  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key, 'utf8'), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

/** Decrypts with the configured key, falling back to the legacy key for older records. */
export const decrypt = (encryptedText: string): string => {
  try {
    return decryptWith(ENCRYPTION_KEY, encryptedText);
  } catch (error) {
    if (ENCRYPTION_KEY === LEGACY_DEFAULT_KEY) throw error;
    return decryptWith(LEGACY_DEFAULT_KEY, encryptedText);
  }
};

/** True when a value was encrypted with the legacy key (and so should be re-encrypted). */
export const isLegacyEncrypted = (encryptedText: string): boolean => {
  if (ENCRYPTION_KEY === LEGACY_DEFAULT_KEY) return false;
  try {
    decryptWith(ENCRYPTION_KEY, encryptedText);
    return false;
  } catch {
    try {
      decryptWith(LEGACY_DEFAULT_KEY, encryptedText);
      return true;
    } catch {
      return false;
    }
  }
};

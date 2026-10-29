import mongoose, { Schema, Document } from 'mongoose';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';
import { tenantPlugin } from './plugins/tenantPlugin';
import { encrypt, decrypt } from '../utils/encryption';

export interface IIntegration extends Document, IAuditable {
  provider: string; // e.g., 'Slack', 'WhatsApp', 'Stripe'
  isActive: boolean;
  credentials: Record<string, string>; // Plain text when manipulating, encrypted in DB
  tenantId: mongoose.Types.ObjectId;
  getDecryptedCredentials(): Record<string, string>;
  getMaskedCredentials(): Record<string, string>;
}

const IntegrationSchema = new Schema<IIntegration>({
  provider: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  credentials: { type: Map, of: String },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
}, { timestamps: true });

// Encrypt credentials before saving
IntegrationSchema.pre('save' as any, function () {
  if (this.isModified('credentials') && this.credentials) {
    const encryptedCreds: Record<string, string> = {};
    const creds: any = this.credentials;
    
    if (creds instanceof Map) {
      creds.forEach((value: string, key: string) => {
        encryptedCreds[key] = !value.includes(':') ? encrypt(value) : value;
      });
      this.credentials = encryptedCreds;
    } else {
      Object.entries(creds).forEach(([key, value]) => {
        encryptedCreds[key] = typeof value === 'string' && !value.includes(':') ? encrypt(value) : String(value);
      });
      this.credentials = encryptedCreds;
    }
  }
});

IntegrationSchema.methods.getDecryptedCredentials = function (): Record<string, string> {
  const decrypted: Record<string, string> = {};
  const creds: any = this.credentials;
  if (creds) {
    if (creds instanceof Map) {
      creds.forEach((value: string, key: string) => {
        try { decrypted[key] = decrypt(value); } catch { decrypted[key] = value; }
      });
    } else {
      Object.entries(creds).forEach(([key, value]) => {
        try { decrypted[key] = decrypt(String(value)); } catch { decrypted[key] = String(value); }
      });
    }
  }
  return decrypted;
};

// Only credential fields that look like secrets (password/secret/token/key-shaped names,
// e.g. "apiKey", "authToken") get masked. Non-secret config (baseUrl, jobsPath, webhookUrl,
// ...) is returned as-is so an admin reopening a saved connection sees what's actually
// configured instead of every field looking blank/wiped.
const SENSITIVE_CREDENTIAL_KEY = /password|secret|token|key/i;

IntegrationSchema.methods.getMaskedCredentials = function (): Record<string, string> {
  const masked: Record<string, string> = {};
  const creds: any = this.credentials;
  if (creds) {
    const decrypted = this.getDecryptedCredentials();
    const keys = creds instanceof Map ? Array.from(creds.keys()) : Object.keys(creds);
    for (const key of keys as string[]) {
      masked[key] = SENSITIVE_CREDENTIAL_KEY.test(key) ? '********' : decrypted[key];
    }
  }
  return masked;
};

IntegrationSchema.plugin(auditPlugin);
IntegrationSchema.plugin(tenantPlugin);

export const Integration = mongoose.model<IIntegration>('Integration', IntegrationSchema);

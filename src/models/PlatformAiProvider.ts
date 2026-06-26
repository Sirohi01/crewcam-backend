import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';
import { encrypt, decrypt } from '../utils/encryption';
export interface IPlatformAiProvider extends ITenantScoped, IAuditable, Document {
  provider: 'OpenAI' | 'Gemini' | 'Anthropic';
  apiKey: string;
  modelName: string;
  isActive: boolean;
  getDecryptedApiKey(): string;
  getMaskedApiKey(): string;
}

const PlatformAiProviderSchema = new Schema<IPlatformAiProvider>({
  provider: { type: String, enum: ['OpenAI', 'Gemini', 'Anthropic'], required: true },
  apiKey: { type: String, default: '' },
  modelName: { type: String, required: true },
  isActive: { type: Boolean, default: false },
}, { timestamps: true });

PlatformAiProviderSchema.index({ tenantId: 1, provider: 1 }, { unique: true });

PlatformAiProviderSchema.pre('save' as any, function (this: any) {
  if (this.isModified('apiKey') && this.apiKey && !this.apiKey.includes(':')) {
    this.apiKey = encrypt(this.apiKey);
  }
});

PlatformAiProviderSchema.methods.getDecryptedApiKey = function (): string {
  if (!this.apiKey) return '';
  try { return decrypt(this.apiKey); } catch { return ''; }
};

PlatformAiProviderSchema.methods.getMaskedApiKey = function (): string {
  return this.apiKey ? '********' : '';
};

PlatformAiProviderSchema.plugin(tenantPlugin);
PlatformAiProviderSchema.plugin(auditPlugin);

export const PlatformAiProvider = mongoose.model<IPlatformAiProvider>('PlatformAiProvider', PlatformAiProviderSchema);

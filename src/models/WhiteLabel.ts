import mongoose, { Schema, Document } from 'mongoose';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';
import { tenantPlugin } from './plugins/tenantPlugin';

export interface IWhiteLabel extends Document, IAuditable {
  tenantId: mongoose.Types.ObjectId;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor: string;
  secondaryColor?: string;
  themeMode: 'light' | 'dark' | 'system';
  customSubdomain?: string;
  customDomain?: string;
  companyNameOverride?: string;
  supportEmail?: string;
}

const WhiteLabelSchema = new Schema<IWhiteLabel>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
  logoUrl: { type: String },
  faviconUrl: { type: String },
  primaryColor: { type: String, default: '#4f46e5' }, // Default Indigo
  secondaryColor: { type: String },
  themeMode: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
  customSubdomain: { type: String, unique: true, sparse: true },
  customDomain: { type: String, unique: true, sparse: true },
  companyNameOverride: { type: String },
  supportEmail: { type: String },
}, { timestamps: true });

WhiteLabelSchema.plugin(auditPlugin);
WhiteLabelSchema.plugin(tenantPlugin);

export const WhiteLabel = mongoose.model<IWhiteLabel>('WhiteLabel', WhiteLabelSchema);

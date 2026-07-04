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

  emailFromName?: string;
  emailFromAddress?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  whatsappEnabled: boolean;
  whatsappNumber?: string;
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

  emailFromName: { type: String },
  emailFromAddress: { type: String },
  // SMTP credentials a company brings for white-labeled outbound mail — password is not
  // captured here; it's configured directly by the platform team when this is wired up.
  smtpHost: { type: String },
  smtpPort: { type: Number },
  smtpUsername: { type: String },
  whatsappEnabled: { type: Boolean, default: false },
  whatsappNumber: { type: String },
}, { timestamps: true });

WhiteLabelSchema.plugin(auditPlugin);
WhiteLabelSchema.plugin(tenantPlugin);

export const WhiteLabel = mongoose.model<IWhiteLabel>('WhiteLabel', WhiteLabelSchema);

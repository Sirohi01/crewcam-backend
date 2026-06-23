import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

export interface ILiveTrackingConsent extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  consentGiven: boolean;
  consentDate?: Date;
  revokedAt?: Date;
}

const liveTrackingConsentSchema = new Schema<ILiveTrackingConsent>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  consentGiven: { type: Boolean, default: false },
  consentDate: { type: Date },
  revokedAt: { type: Date },
}, { timestamps: true });

liveTrackingConsentSchema.plugin(tenantPlugin);

export const LiveTrackingConsent = mongoose.model<ILiveTrackingConsent>('LiveTrackingConsent', liveTrackingConsentSchema);

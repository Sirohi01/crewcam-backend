import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

/**
 * An employee's acknowledgement of one version of a CompanyPolicy (Phase 1D-2).
 * A new policy version needs a fresh acknowledgement; older ones stay as the record.
 * (PolicyAcceptance is the candidate-onboarding equivalent and points at Policy.)
 */
export interface IPolicyAcknowledgement extends Document {
  tenantId: Types.ObjectId;
  policyId: Types.ObjectId;
  userId: Types.ObjectId;
  version: string;
  acknowledgedAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

const policyAcknowledgementSchema = new Schema<IPolicyAcknowledgement>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  policyId: { type: Schema.Types.ObjectId, ref: 'CompanyPolicy', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  version: { type: String, required: true },
  acknowledgedAt: { type: Date, default: Date.now },
  ipAddress: { type: String },
  userAgent: { type: String },
}, { timestamps: true });

policyAcknowledgementSchema.index({ tenantId: 1, policyId: 1, userId: 1, version: 1 }, { unique: true });
policyAcknowledgementSchema.index({ tenantId: 1, userId: 1 });
policyAcknowledgementSchema.plugin(tenantPlugin);

export const PolicyAcknowledgement = mongoose.model<IPolicyAcknowledgement>('PolicyAcknowledgement', policyAcknowledgementSchema);

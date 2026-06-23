import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IPolicyAcceptance extends ITenantScoped {
  candidateId?: Types.ObjectId;
  employeeId?: Types.ObjectId;
  policyId?: Types.ObjectId;
  policyVersion?: string;
  status: 'Pending' | 'Accepted';
  acceptedAt?: Date;
  ipAddress?: string;
}

const policyAcceptanceSchema = new Schema<IPolicyAcceptance>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate' },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  policyId: { type: Schema.Types.ObjectId, ref: 'Policy' },
  policyVersion: { type: String },
  status: { type: String, enum: ['Pending', 'Accepted'], default: 'Pending' },
  acceptedAt: { type: Date },
  ipAddress: { type: String }
}, { timestamps: true });

policyAcceptanceSchema.plugin(tenantPlugin);

export const PolicyAcceptance = mongoose.model<IPolicyAcceptance>('PolicyAcceptance', policyAcceptanceSchema);

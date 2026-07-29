import mongoose, { Schema, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IPolicyAcceptance extends ITenantScoped {
  candidateName?: string;
  employeeCode?: string;
  designation?: string;
  department?: string;
  dateOfJoining?: string;
  workLocation?: string;

  candidateId?: Types.ObjectId;
  employeeId?: Types.ObjectId;
  policyId?: Types.ObjectId;
  policyVersion?: string;
  policyTitle?: string;
  // Policy content snapshot (so PDF is frozen even if policy changes)
  policyContentSnapshot?: string;
  signerName?: string;
  signerDesignation?: string;
  // Acknowledgement
  hasRead?: boolean;
  understands?: boolean;
  agreesToComply?: boolean;
  // Metadata
  status: 'Pending' | 'Accepted';
  acceptedAt?: Date;
  ipAddress?: string;
  userAgent?: string;
  pdfUrl?: string;
}

const policyAcceptanceSchema = new Schema<IPolicyAcceptance>({
  candidateName: { type: String },
  employeeCode: { type: String },
  designation: { type: String },
  department: { type: String },
  dateOfJoining: { type: String },
  workLocation: { type: String },

  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate' },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  policyId: { type: Schema.Types.ObjectId, ref: 'Policy' },
  policyVersion: { type: String },
  policyTitle: { type: String },
  policyContentSnapshot: { type: String },
  signerName: { type: String },
  signerDesignation: { type: String },
  hasRead: { type: Boolean, default: false },
  understands: { type: Boolean, default: false },
  agreesToComply: { type: Boolean, default: false },
  status: { type: String, enum: ['Pending', 'Accepted'], default: 'Pending' },
  acceptedAt: { type: Date },
  ipAddress: { type: String },
  userAgent: { type: String },
  pdfUrl: { type: String },
}, { timestamps: true });

policyAcceptanceSchema.plugin(tenantPlugin);

export const PolicyAcceptance = mongoose.model<IPolicyAcceptance>('PolicyAcceptance', policyAcceptanceSchema);

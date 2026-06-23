import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IBGVRequest extends ITenantScoped {
  candidateId?: Types.ObjectId;
  employeeId?: Types.ObjectId;
  vendor?: string;
  requestedBy: Types.ObjectId;
  requestDate: Date;
  checksRequested: string[];
  status: 'Initiated' | 'InProgress' | 'Completed' | 'Flagged';
  reportUrl?: string;
  overallResult?: 'Clear' | 'Discrepancy' | 'Pending';
  discrepancyDetails?: string;
  completedDate?: Date;
}

const bgvRequestSchema = new Schema<IBGVRequest>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate' },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  vendor: { type: String },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  requestDate: { type: Date, default: Date.now },
  checksRequested: [{ type: String }],
  status: { type: String, enum: ['Initiated', 'InProgress', 'Completed', 'Flagged'], default: 'Initiated' },
  reportUrl: { type: String },
  overallResult: { type: String, enum: ['Clear', 'Discrepancy', 'Pending'], default: 'Pending' },
  discrepancyDetails: { type: String },
  completedDate: { type: Date }
}, { timestamps: true });

bgvRequestSchema.plugin(tenantPlugin);

export const BGVRequest = mongoose.model<IBGVRequest>('BGVRequest', bgvRequestSchema);

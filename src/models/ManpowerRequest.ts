import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IManpowerRequest extends Document {
  tenantId: Types.ObjectId;
  jobTitle: string;
  departmentId?: Types.ObjectId;
  requestDate?: Date;
  locationBranchId?: Types.ObjectId;
  designation?: string;
  reportingTo?: Types.ObjectId;
  employmentTypes?: string[];
  hiringReasons?: string[];
  jobDescriptionSummary?: string;
  kraReport?: string;
  numberOfPositions: number;
  employmentType: string;
  reasonForHiring: string;
  priority: string;
  budgetCTC?: number;
  salaryCtcMin?: number;
  salaryCtcMax?: number;
  budgetApprovedBy?: Types.ObjectId;
  benefits?: string[];
  otherBenefits?: string;
  requiredJoiningDate?: Date;
  isUrgent?: boolean;
  requestReceivedOn?: Date;
  recruitmentStartDate?: Date;
  recruitmentStatus?: string;
  declarationAccepted?: boolean;
  justification?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedBy?: Types.ObjectId;
  approvedBy?: Types.ObjectId;
  rejectionReason?: string;
  approvalDate?: Date;
}

const manpowerRequestSchema = new Schema<IManpowerRequest>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  jobTitle: { type: String, required: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
  requestDate: { type: Date },
  locationBranchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  designation: { type: String },
  reportingTo: { type: Schema.Types.ObjectId, ref: 'User' },
  employmentTypes: [{ type: String }],
  hiringReasons: [{ type: String }],
  jobDescriptionSummary: { type: String },
  kraReport: { type: String },
  numberOfPositions: { type: Number, required: true, default: 1 },
  employmentType: { type: String, required: true, default: 'Full-time' },
  reasonForHiring: { type: String, required: true, default: 'New Position' },
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
  budgetCTC: { type: Number },
  salaryCtcMin: { type: Number },
  salaryCtcMax: { type: Number },
  budgetApprovedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  benefits: [{ type: String }],
  otherBenefits: { type: String },
  requiredJoiningDate: { type: Date },
  isUrgent: { type: Boolean, default: false },
  requestReceivedOn: { type: Date },
  recruitmentStartDate: { type: Date },
  recruitmentStatus: { type: String },
  declarationAccepted: { type: Boolean, default: false },
  justification: { type: String },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String },
  approvalDate: { type: Date }
}, {
  timestamps: true
});

import { tenantPlugin } from './plugins/tenantPlugin';
import { auditPlugin } from './plugins/auditPlugin';

manpowerRequestSchema.plugin(tenantPlugin);
manpowerRequestSchema.plugin(auditPlugin);

export const ManpowerRequest = mongoose.model<IManpowerRequest>('ManpowerRequest', manpowerRequestSchema);

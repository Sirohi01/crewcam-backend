import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IApprovalStep {
  approverId: Types.ObjectId;
  role?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  comments?: string;
  actionDate?: Date;
}

export interface ISelectionApproval extends ITenantScoped {
  candidateId: Types.ObjectId;
  jobRole: string;
  departmentId?: Types.ObjectId;
  proposedCTC?: number;
  budgetedCTC?: number;
  recruitmentSource?: string;
  recruitmentSummary?: string;
  justificationForVariance?: string;
  approvalNotes?: string;
  approvalChain: IApprovalStep[];
  finalStatus: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: Types.ObjectId;
  approvalDate?: Date;
}

const selectionApprovalSchema = new Schema<ISelectionApproval>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  jobRole: { type: String, required: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
  proposedCTC: { type: Number },
  budgetedCTC: { type: Number },
  recruitmentSource: { type: String },
  recruitmentSummary: { type: String },
  justificationForVariance: { type: String },
  approvalNotes: { type: String },
  approvalChain: [{
    approverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    comments: { type: String },
    actionDate: { type: Date }
  }],
  finalStatus: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvalDate: { type: Date }
}, { timestamps: true });

selectionApprovalSchema.plugin(tenantPlugin);

export const SelectionApproval = mongoose.model<ISelectionApproval>('SelectionApproval', selectionApprovalSchema);

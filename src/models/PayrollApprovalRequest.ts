import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IPayrollApprovalRequest extends ITenantScoped, IAuditable, Document {
  employeeIds: Types.ObjectId[];
  month: number;
  year: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedBy: Types.ObjectId;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewerComments?: string;
  generatedSlipIds: Types.ObjectId[];
}

const PayrollApprovalRequestSchema = new Schema<IPayrollApprovalRequest>({
  employeeIds: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending', index: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  reviewerComments: { type: String },
  generatedSlipIds: [{ type: Schema.Types.ObjectId, ref: 'SalarySlip' }],
}, { timestamps: true });

PayrollApprovalRequestSchema.index({ tenantId: 1, month: 1, year: 1, status: 1 });

PayrollApprovalRequestSchema.plugin(tenantPlugin);
PayrollApprovalRequestSchema.plugin(auditPlugin);

export const PayrollApprovalRequest = mongoose.model<IPayrollApprovalRequest>('PayrollApprovalRequest', PayrollApprovalRequestSchema);

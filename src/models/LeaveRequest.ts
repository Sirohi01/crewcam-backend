import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

export interface ILeaveRequest extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  leaveTypeId: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  approvedBy?: Types.ObjectId;
  rejectionReason?: string;
  attachmentUrl?: string;
  isHalfDay?: boolean;
  halfDaySession?: 'first' | 'second';
  contactNumber?: string;
  contactEmail?: string;
}

const leaveRequestSchema = new Schema<ILeaveRequest>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  leaveTypeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String, required: true },
  // Cancelled = withdrawn by the employee before a decision.
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'], default: 'Pending' },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String },
  attachmentUrl: { type: String },
  isHalfDay: { type: Boolean, default: false },
  halfDaySession: { type: String, enum: ['first', 'second'] },
  contactNumber: { type: String, trim: true },
  contactEmail: { type: String, trim: true, lowercase: true }
}, {
  timestamps: true
});

leaveRequestSchema.index({ tenantId: 1, userId: 1, status: 1 });
leaveRequestSchema.index({ tenantId: 1, status: 1 });

leaveRequestSchema.plugin(tenantPlugin);

export const LeaveRequest = mongoose.model<ILeaveRequest>('LeaveRequest', leaveRequestSchema);

import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

export interface ILeaveRequest extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  leaveTypeId: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: Types.ObjectId;
  rejectionReason?: string;
  attachmentUrl?: string;
}

const leaveRequestSchema = new Schema<ILeaveRequest>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  leaveTypeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String },
  attachmentUrl: { type: String }
}, {
  timestamps: true
});

leaveRequestSchema.plugin(tenantPlugin);

export const LeaveRequest = mongoose.model<ILeaveRequest>('LeaveRequest', leaveRequestSchema);

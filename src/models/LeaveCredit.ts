import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

export interface ILeaveCredit extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  leaveTypeId: Types.ObjectId;
  days: number;
  reason: string;
  creditedBy: Types.ObjectId;
}

const leaveCreditSchema = new Schema<ILeaveCredit>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  leaveTypeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  days: { type: Number, required: true },
  reason: { type: String, required: true },
  creditedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

leaveCreditSchema.plugin(tenantPlugin);

export const LeaveCredit = mongoose.model<ILeaveCredit>('LeaveCredit', leaveCreditSchema);

import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface ILeaveType extends ITenantScoped, IAuditable {
  name: string;
  code: string;
  isPaid: boolean;
  defaultDays: number;
  isActive: boolean;
}

const LeaveTypeSchema = new Schema<ILeaveType>({
  name: { type: String, required: true },
  code: { type: String, required: true },
  isPaid: { type: Boolean, default: true },
  defaultDays: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

LeaveTypeSchema.plugin(tenantPlugin);
LeaveTypeSchema.plugin(auditPlugin);

export const LeaveType = mongoose.model<ILeaveType>('LeaveType', LeaveTypeSchema);

import mongoose, { Schema, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IReleaseQA extends ITenantScoped {
  employeeId: Types.ObjectId;
  qaStatus: 'Pending' | 'Passed' | 'Failed';
  remarks?: string;
  checkedBy?: Types.ObjectId;
}

const releaseQASchema = new Schema<IReleaseQA>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  qaStatus: { type: String, enum: ['Pending', 'Passed', 'Failed'], default: 'Pending' },
  remarks: { type: String },
  checkedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

releaseQASchema.plugin(tenantPlugin);

export const ReleaseQA = mongoose.model<IReleaseQA>('ReleaseQA', releaseQASchema);

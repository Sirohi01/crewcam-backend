import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from '../plugins/auditPlugin';

export interface ILeaveYearStartMonth extends IAuditable {
  name: string;
  code?: string;
  description?: string;
  isActive: boolean;
}

const schema = new Schema<ILeaveYearStartMonth>({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, trim: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

schema.plugin(auditPlugin);

export const LeaveYearStartMonth = mongoose.models.LeaveYearStartMonth as Model<ILeaveYearStartMonth> || mongoose.model<ILeaveYearStartMonth>('LeaveYearStartMonth', schema);

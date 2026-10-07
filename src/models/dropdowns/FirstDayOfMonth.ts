import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from '../plugins/auditPlugin';

export interface IFirstDayOfMonth extends IAuditable {
  name: string;
  code?: string;
  description?: string;
  isActive: boolean;
}

const schema = new Schema<IFirstDayOfMonth>({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, trim: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

schema.plugin(auditPlugin);

export const FirstDayOfMonth = mongoose.models.FirstDayOfMonth as Model<IFirstDayOfMonth> || mongoose.model<IFirstDayOfMonth>('FirstDayOfMonth', schema);

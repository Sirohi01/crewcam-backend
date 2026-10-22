import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from '../plugins/auditPlugin';

export interface INumberFormat extends IAuditable {
  name: string;
  code?: string;
  description?: string;
  isActive: boolean;
}

const schema = new Schema<INumberFormat>({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, trim: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

schema.plugin(auditPlugin);

export const NumberFormat = mongoose.models.NumberFormat as Model<INumberFormat> || mongoose.model<INumberFormat>('NumberFormat', schema);

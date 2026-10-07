import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from '../plugins/auditPlugin';

export interface IAdvancePayment extends IAuditable {
  name: string;
  code?: string;
  description?: string;
  isActive: boolean;
}

const schema = new Schema<IAdvancePayment>({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, trim: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

schema.plugin(auditPlugin);

export const AdvancePayment = mongoose.models.AdvancePayment as Model<IAdvancePayment> || mongoose.model<IAdvancePayment>('AdvancePayment', schema);

import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from '../plugins/auditPlugin';

export interface IBillingCycle extends IAuditable {
  name: string;
  code: string;
  period: string;
  description: string;
  isActive: boolean;
}

const schema = new Schema<IBillingCycle>({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, required: true, trim: true },
  period: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

schema.plugin(auditPlugin);

export const BillingCycle = mongoose.models.BillingCycle as Model<IBillingCycle> || mongoose.model<IBillingCycle>('BillingCycle', schema);

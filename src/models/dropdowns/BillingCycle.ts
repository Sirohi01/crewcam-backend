import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from '../plugins/auditPlugin';

export interface IBillingCycle extends IAuditable {
  name: string;
  code: string;
  period: string;
  description: string;
  // Percentage knocked off the subtotal when this cycle is billed — e.g. 10 for
  // Quarterly's "Save 10%", 0 for Monthly. Feeds straight into the plan builder's
  // pricing calculation, not just the display label.
  discountPercent: number;
  isActive: boolean;
}

const schema = new Schema<IBillingCycle>({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, required: true, trim: true },
  period: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  discountPercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

schema.plugin(auditPlugin);

export const BillingCycle = mongoose.models.BillingCycle as Model<IBillingCycle> || mongoose.model<IBillingCycle>('BillingCycle', schema);

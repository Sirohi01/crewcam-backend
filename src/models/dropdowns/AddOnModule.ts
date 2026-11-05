import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from '../plugins/auditPlugin';
import { MODULE_CATEGORIES } from './CoreFeature';

export interface IAddOnModule extends IAuditable {
  name: string;
  code: string;
  description: string;
  price: number;
  pricingUnit: string; // e.g. "Per Employee / Month", "Per Company / Month", "Flat / Month"
  badge?: string; // e.g. "Popular" — shown as a small callout on the plan-builder row
  category: string;
  isActive: boolean;
}

const addOnModuleSchema = new Schema<IAddOnModule>({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  pricingUnit: { type: String, required: true, default: 'Per Employee / Month' },
  badge: { type: String, trim: true },
  category: { type: String, required: true, enum: MODULE_CATEGORIES },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

addOnModuleSchema.plugin(auditPlugin);

export const AddOnModule = mongoose.models.AddOnModule as Model<IAddOnModule> || mongoose.model<IAddOnModule>('AddOnModule', addOnModuleSchema);

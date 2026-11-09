import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from '../plugins/auditPlugin';
import { MODULE_CATEGORIES } from './CoreFeature';

export interface IModule extends IAuditable {
  name: string;
  code: string;
  category: string;
  description: string;
  icon?: string; // uploaded icon URL, via the shared /upload endpoint
  isActive: boolean;
  visibleInPackages: boolean; // selectable when building a subscription package
  isDefaultModule: boolean; // pre-selected (included by default) in the package builder
  // Optional list price for selling the module as an add-on. Unset = "price on request",
  // so a module can be offered before sales has fixed its price (e.g. Payment Obligations).
  price?: number;
  pricingUnit?: 'Per Employee / Month' | 'Per Company / Month';
}

const moduleSchema = new Schema<IModule>({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, required: true, trim: true },
  category: { type: String, required: true, enum: MODULE_CATEGORIES },
  description: { type: String, required: true },
  icon: { type: String },
  isActive: { type: Boolean, default: true },
  visibleInPackages: { type: Boolean, default: true },
  isDefaultModule: { type: Boolean, default: false },
  price: { type: Number, min: 0 },
  pricingUnit: { type: String, enum: ['Per Employee / Month', 'Per Company / Month'], default: 'Per Employee / Month' },
}, { timestamps: true });

moduleSchema.plugin(auditPlugin);

export const PlatformModule = mongoose.models.PlatformModule as Model<IModule> || mongoose.model<IModule>('PlatformModule', moduleSchema, 'platformmodules');

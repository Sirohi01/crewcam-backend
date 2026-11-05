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
}, { timestamps: true });

moduleSchema.plugin(auditPlugin);

export const PlatformModule = mongoose.models.PlatformModule as Model<IModule> || mongoose.model<IModule>('PlatformModule', moduleSchema, 'platformmodules');

import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from '../plugins/auditPlugin';

export const MODULE_CATEGORIES = ['Core HR', 'Workforce', 'Talent', 'Finance', 'Advanced'] as const;

export interface ICoreFeature extends IAuditable {
  name: string;
  code: string;
  description: string;
  category: string;
  isActive: boolean;
}

const coreFeatureSchema = new Schema<ICoreFeature>({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  category: { type: String, required: true, enum: MODULE_CATEGORIES },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

coreFeatureSchema.plugin(auditPlugin);

export const CoreFeature = mongoose.models.CoreFeature as Model<ICoreFeature> || mongoose.model<ICoreFeature>('CoreFeature', coreFeatureSchema);

import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from '../plugins/auditPlugin';

export interface ICoreFeature extends IAuditable {
  name: string;
  code: string;
  description: string;
  isActive: boolean;
}

const coreFeatureSchema = new Schema<ICoreFeature>({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

coreFeatureSchema.plugin(auditPlugin);

export const CoreFeature = mongoose.models.CoreFeature as Model<ICoreFeature> || mongoose.model<ICoreFeature>('CoreFeature', coreFeatureSchema);

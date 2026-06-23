import mongoose, { Schema, Document } from 'mongoose';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IFeatureFlag extends Document, IAuditable {
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
}

const FeatureFlagSchema = new Schema<IFeatureFlag>({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

FeatureFlagSchema.plugin(auditPlugin);

export const FeatureFlag = mongoose.model<IFeatureFlag>('FeatureFlag', FeatureFlagSchema);

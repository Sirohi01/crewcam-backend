import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from '../plugins/auditPlugin';

export interface IIndustry extends IAuditable {
  name: string;
  code: string;
  description: string;
  isActive: boolean;
}

const industrySchema = new Schema<IIndustry>({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

industrySchema.plugin(auditPlugin);

export const Industry = mongoose.models.Industry as Model<IIndustry> || mongoose.model<IIndustry>('Industry', industrySchema);

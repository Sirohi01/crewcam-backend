import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface ICompanySize extends IAuditable {
  name: string;
  rangeFrom: number;
  rangeTo: number;
  code?: string;
  description?: string;
  isActive: boolean;
}

const companySizeSchema = new Schema<ICompanySize>({
  name: { type: String, required: true, trim: true },
  rangeFrom: { type: Number, required: true },
  rangeTo: { type: Number, required: true },
  code: { type: String, trim: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

companySizeSchema.plugin(auditPlugin);

export const CompanySize = mongoose.models.CompanySize as Model<ICompanySize> || mongoose.model<ICompanySize>('CompanySize', companySizeSchema);

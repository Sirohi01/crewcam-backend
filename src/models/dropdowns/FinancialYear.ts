import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from '../plugins/auditPlugin';

export interface IFinancialYear extends IAuditable {
  name: string;
  code: string;
  description: string;
  isActive: boolean;
}

const schema = new Schema<IFinancialYear>({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

schema.plugin(auditPlugin);

export const FinancialYear = mongoose.models.FinancialYear as Model<IFinancialYear> || mongoose.model<IFinancialYear>('FinancialYear', schema);

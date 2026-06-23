import mongoose, { Schema, Document } from 'mongoose';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IPackage extends Document, IAuditable {
  name: string;
  description: string;
  maxCompanies: number;
  maxBranches: number;
  maxDepartments: number;
  maxDesignations: number;
  maxUsers: number;
  features: string[];
  priceINR: number;
  priceUSD: number;
  isActive: boolean;
}

const PackageSchema = new Schema<IPackage>({
  name: { type: String, required: true },
  description: { type: String },
  maxCompanies: { type: Number, required: true, default: 1 },
  maxBranches: { type: Number, required: true, default: 1 },
  maxDepartments: { type: Number, required: true, default: 5 },
  maxDesignations: { type: Number, required: true, default: 10 },
  maxUsers: { type: Number, required: true },
  features: [{ type: String }],
  priceINR: { type: Number, required: true },
  priceUSD: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

PackageSchema.plugin(auditPlugin);

export const Package = mongoose.model<IPackage>('Package', PackageSchema);

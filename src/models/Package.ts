import mongoose, { Schema, Document } from 'mongoose';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export const PACKAGE_TIERS = ['BASIC', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM'] as const;
export type PackageTier = typeof PACKAGE_TIERS[number];

export interface IPackage extends Document, IAuditable {
  name: string;
  tier: PackageTier;
  description: string;
  maxCompanies: number;
  maxBranches: number;
  maxDepartments: number;
  maxDesignations: number;
  maxUsers: number;
  features: string[];
  priceINR: number;
  priceUSD: number;
  pricePerUserMonthlyINR: number;
  pricePerUserMonthlyUSD: number;
  pricePerUserYearlyINR: number;
  pricePerUserYearlyUSD: number;
  setupFeeINR: number;
  setupFeeUSD: number;
  freeAiCredits: number;
  aiCreditTopUpPriceINR: number;
  aiCreditTopUpPriceUSD: number;
  isActive: boolean;
}

const PackageSchema = new Schema<IPackage>({
  name: { type: String, required: true },
  tier: { type: String, enum: PACKAGE_TIERS, default: 'CUSTOM' },
  description: { type: String },
  maxCompanies: { type: Number, required: true, default: 1 },
  maxBranches: { type: Number, required: true, default: 1 },
  maxDepartments: { type: Number, required: true, default: 5 },
  maxDesignations: { type: Number, required: true, default: 10 },
  maxUsers: { type: Number, required: true },
  features: [{ type: String }],
  priceINR: { type: Number, default: 0 },
  priceUSD: { type: Number, default: 0 },
  pricePerUserMonthlyINR: { type: Number, default: 0 },
  pricePerUserMonthlyUSD: { type: Number, default: 0 },
  pricePerUserYearlyINR: { type: Number, default: 0 },
  pricePerUserYearlyUSD: { type: Number, default: 0 },
  setupFeeINR: { type: Number, default: 0 },
  setupFeeUSD: { type: Number, default: 0 },
  // AI credits bundled free with this package; anything beyond this is a separate paid top-up, never drawn from the setup fee.
  freeAiCredits: { type: Number, default: 0 },
  aiCreditTopUpPriceINR: { type: Number, default: 0 },
  aiCreditTopUpPriceUSD: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

PackageSchema.plugin(auditPlugin);

export const Package = mongoose.model<IPackage>('Package', PackageSchema);

import mongoose, { Schema, Model, Types } from 'mongoose';
import { auditPlugin, IAuditable } from '../plugins/auditPlugin';

export const FEATURE_TYPES = ['Native', 'Third-Party'] as const;
// Mirrors Package.PACKAGE_TIERS — kept as a local copy of the literal values (not an
// import) since "which plan tiers include this feature" is a presentation concern of
// this catalog, independent of the Package schema itself.
export const FEATURE_PACKAGE_TIERS = ['BASIC', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM'] as const;

export interface IModuleFeature extends IAuditable {
  moduleId: Types.ObjectId;
  name: string;
  code: string;
  description?: string;
  type: typeof FEATURE_TYPES[number];

  // Integration details — only meaningful when type === 'Third-Party'
  provider?: string;
  integrationType?: string;
  apiPlan?: string;
  costUnit?: string;

  // Pricing — only meaningful when type === 'Third-Party'
  yourCost?: number;
  sellingPrice?: number;
  billingType?: string;
  billingCycle?: string;

  // Usage & limits
  usageLimitEnabled: boolean;
  unitsIncluded?: number;
  additionalUnitCost?: number;

  // Which plan tiers include this feature
  packageTiers: string[];

  isActive: boolean;
}

const moduleFeatureSchema = new Schema<IModuleFeature>({
  moduleId: { type: Schema.Types.ObjectId, ref: 'PlatformModule', required: true, index: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  type: { type: String, required: true, enum: FEATURE_TYPES, default: 'Native' },

  provider: { type: String, trim: true },
  integrationType: { type: String, trim: true },
  apiPlan: { type: String, trim: true },
  costUnit: { type: String, trim: true },

  yourCost: { type: Number, min: 0 },
  sellingPrice: { type: Number, min: 0 },
  billingType: { type: String, trim: true },
  billingCycle: { type: String, trim: true },

  usageLimitEnabled: { type: Boolean, default: false },
  unitsIncluded: { type: Number, min: 0 },
  additionalUnitCost: { type: Number, min: 0 },

  packageTiers: [{ type: String, enum: FEATURE_PACKAGE_TIERS }],

  isActive: { type: Boolean, default: true },
}, { timestamps: true });

moduleFeatureSchema.index({ moduleId: 1, name: 1 }, { unique: true });
moduleFeatureSchema.plugin(auditPlugin);

export const ModuleFeature = mongoose.models.ModuleFeature as Model<IModuleFeature> || mongoose.model<IModuleFeature>('ModuleFeature', moduleFeatureSchema);

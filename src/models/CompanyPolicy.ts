import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ICompanyPolicy extends Document {
  tenantId: Types.ObjectId;
  title: string;
  code: string;
  category: string;
  subCategory?: string;
  type: 'Mandatory' | 'Recommended' | 'Informational';
  status: 'Draft' | 'Published' | 'Archived';
  effectiveFrom: Date;
  version: string;
  shortDescription: string;
  detailedDescription?: string;
  documentUrl?: string;
  applicability: {
    allEmployees: boolean;
    departments: Types.ObjectId[];
    designations: Types.ObjectId[];
    locations: Types.ObjectId[];
  };
  settings: {
    requireAck: boolean;
    showInPortal: boolean;
    includeInTraining: boolean;
    reviewDate?: Date;
  };
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
}

const companyPolicySchema = new Schema<ICompanyPolicy>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    title: { type: String, required: true },
    code: { type: String, required: true },
    category: { type: String, required: true },
    subCategory: { type: String },
    type: { type: String, enum: ['Mandatory', 'Recommended', 'Informational'], required: true },
    status: { type: String, enum: ['Draft', 'Published', 'Archived'], required: true },
    effectiveFrom: { type: Date, required: true },
    version: { type: String, required: true },
    shortDescription: { type: String, required: true },
    detailedDescription: { type: String },
    documentUrl: { type: String },
    applicability: {
      allEmployees: { type: Boolean, default: true },
      departments: [{ type: Schema.Types.ObjectId, ref: 'Department' }],
      designations: [{ type: Schema.Types.ObjectId, ref: 'Designation' }],
      locations: [{ type: Schema.Types.ObjectId, ref: 'Location' }]
    },
    settings: {
      requireAck: { type: Boolean, default: false },
      showInPortal: { type: Boolean, default: true },
      includeInTraining: { type: Boolean, default: false },
      reviewDate: { type: Date }
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  {
    timestamps: true
  }
);

// Ensure unique code per tenant
companyPolicySchema.index({ tenantId: 1, code: 1 }, { unique: true });

export const CompanyPolicy = mongoose.model<ICompanyPolicy>('CompanyPolicy', companyPolicySchema);

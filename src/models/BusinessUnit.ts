import mongoose, { Document, Schema } from 'mongoose';

export interface IBusinessUnit extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  code: string;
  head: mongoose.Types.ObjectId | null;
  parent: mongoose.Types.ObjectId | null;
  type: string;
  status: string;
  description?: string;
  establishedOn?: Date;
  totalEmployees?: number;
  totalDepartments?: number;
  primaryFocus?: string;
  keyServices?: string;
  annualBudget?: string;
  costCenters?: string[];
  financialOwner?: mongoose.Types.ObjectId | null;
  iconUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BusinessUnitSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    head: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    parent: { type: String, default: null },
    type: { type: String, required: true, default: 'Retail Interiors' },
    status: { type: String, required: true, enum: ['Active', 'Inactive'], default: 'Active' },
    description: { type: String },
    establishedOn: { type: Date },
    totalEmployees: { type: Number },
    totalDepartments: { type: Number },
    primaryFocus: { type: String },
    keyServices: { type: String },
    annualBudget: { type: String },
    costCenters: [{ type: String }],
    financialOwner: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    iconUrl: { type: String },
  },
  { timestamps: true }
);

// Compound index for uniqueness within a tenant
BusinessUnitSchema.index({ tenantId: 1, code: 1 }, { unique: true });

export default mongoose.model<IBusinessUnit>('BusinessUnit', BusinessUnitSchema);

import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IDepartmentDocument {
  name: string;
  url: string;
  size?: number;
  uploadedAt: Date;
}

export interface IDepartment extends ITenantScoped, IAuditable {
  name: string;
  code: string;
  branchId: mongoose.Types.ObjectId;
  hodEmployeeId?: mongoose.Types.ObjectId;
  reportingToId?: mongoose.Types.ObjectId;
  assistantCoHeadId?: mongoose.Types.ObjectId;
  budgetOwnerId?: mongoose.Types.ObjectId;
  description?: string;
  isActive: boolean;
  departmentType?: string;
  businessUnit?: mongoose.Types.ObjectId | string;
  effectiveDate?: Date;
  keyResponsibilities?: string;
  employeeCapacity?: number;
  workingDays?: string;
  defaultShift?: string;
  costCenter?: string;
  probationPeriodMonths?: number;
  departmentEmail?: string;
  departmentKeywords?: string[];
  documents?: IDepartmentDocument[];
}

const DepartmentSchema = new Schema<IDepartment>({
  name: { type: String, required: true },
  code: { type: String, required: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  hodEmployeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  reportingToId: { type: Schema.Types.ObjectId, ref: 'User' },
  assistantCoHeadId: { type: Schema.Types.ObjectId, ref: 'User' },
  budgetOwnerId: { type: Schema.Types.ObjectId, ref: 'User' },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  departmentType: { type: String },
  businessUnit: { type: Schema.Types.ObjectId, ref: 'BusinessUnit' },
  effectiveDate: { type: Date },
  keyResponsibilities: { type: String },
  employeeCapacity: { type: Number },
  workingDays: { type: String, default: 'Monday - Saturday' },
  defaultShift: { type: String, default: 'General Shift (09:30 AM - 06:30 PM)' },
  costCenter: { type: String },
  probationPeriodMonths: { type: Number },
  departmentEmail: { type: String },
  departmentKeywords: { type: [String], default: [] },
  documents: [{
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

// Not a hard unique index: tenants that already have duplicate codes from before this
// field was validated shouldn't fail to boot. createDepartment/updateDepartment do the
// actual duplicate check; this index just keeps that lookup fast.
DepartmentSchema.index({ tenantId: 1, code: 1 });

DepartmentSchema.plugin(tenantPlugin);
DepartmentSchema.plugin(auditPlugin);

export const Department = mongoose.model<IDepartment>('Department', DepartmentSchema);

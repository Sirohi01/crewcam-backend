import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IDepartment extends ITenantScoped, IAuditable {
  name: string;
  code: string;
  branchId: mongoose.Types.ObjectId;
  hodEmployeeId?: mongoose.Types.ObjectId;
  reportingToId?: mongoose.Types.ObjectId;
  description?: string;
  isActive: boolean;
  departmentType?: string;
  businessUnit?: string;
  effectiveDate?: Date;
  keyResponsibilities?: string;
  employeeCapacity?: number;
  workingDays?: string;
  defaultShift?: string;
}

const DepartmentSchema = new Schema<IDepartment>({
  name: { type: String, required: true },
  code: { type: String, required: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  hodEmployeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  reportingToId: { type: Schema.Types.ObjectId, ref: 'User' },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  departmentType: { type: String },
  businessUnit: { type: String },
  effectiveDate: { type: Date },
  keyResponsibilities: { type: String },
  employeeCapacity: { type: Number },
  workingDays: { type: String, default: 'Monday - Saturday' },
  defaultShift: { type: String, default: 'General Shift (09:30 AM - 06:30 PM)' },
}, { timestamps: true });

DepartmentSchema.plugin(tenantPlugin);
DepartmentSchema.plugin(auditPlugin);

export const Department = mongoose.model<IDepartment>('Department', DepartmentSchema);

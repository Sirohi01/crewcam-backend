import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface ISubDepartment extends ITenantScoped, IAuditable {
  name: string;
  code: string;
  shortName?: string;
  description?: string;
  parentDepartmentId: mongoose.Types.ObjectId;
  reportingToId?: mongoose.Types.ObjectId;
  businessUnit?: string;
  costCenter?: string;
  location?: string;
  isActive: boolean;
  effectiveDate?: Date;
}

const SubDepartmentSchema = new Schema<ISubDepartment>({
  name: { type: String, required: true },
  code: { type: String, required: true },
  shortName: { type: String },
  description: { type: String },
  parentDepartmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
  reportingToId: { type: Schema.Types.ObjectId, ref: 'Department' },
  businessUnit: { type: String },
  costCenter: { type: String },
  location: { type: String },
  isActive: { type: Boolean, default: true },
  effectiveDate: { type: Date },
}, { timestamps: true });

SubDepartmentSchema.plugin(tenantPlugin);
SubDepartmentSchema.plugin(auditPlugin);

export const SubDepartment = mongoose.model<ISubDepartment>('SubDepartment', SubDepartmentSchema);

import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IDesignation extends ITenantScoped, IAuditable {
  name: string;
  code: string;
  jobGrade?: string;
  jobFamily?: string;
  businessUnit?: string;
  division?: string;
  departmentId?: mongoose.Types.ObjectId;
  department?: string; // Storing string mapping if department model is not strictly linked
  reportsToDesignationId?: mongoose.Types.ObjectId;
  employmentType?: string;
  flsaType?: string;
  effectiveFrom?: Date;
  summary?: string;
  keyResponsibilities?: string;
  keySkills?: string;
  qualification?: string;
  experienceRequired?: string;
  ctcRange?: string;
  designationLevel?: string;
  location?: string;
  remarks?: string;
  icon?: string;
  isActive: boolean;
}

const DesignationSchema = new Schema<IDesignation>({
  name: { type: String, required: true },
  code: { type: String, required: true },
  jobGrade: { type: String },
  jobFamily: { type: String },
  businessUnit: { type: String },
  division: { type: String },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
  department: { type: String },
  reportsToDesignationId: { type: Schema.Types.ObjectId, ref: 'Designation' },
  employmentType: { type: String },
  flsaType: { type: String },
  effectiveFrom: { type: Date },
  summary: { type: String },
  keyResponsibilities: { type: String },
  keySkills: { type: String },
  qualification: { type: String },
  experienceRequired: { type: String },
  ctcRange: { type: String },
  designationLevel: { type: String },
  location: { type: String },
  remarks: { type: String },
  icon: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

DesignationSchema.plugin(tenantPlugin);
DesignationSchema.plugin(auditPlugin);

export const Designation = mongoose.model<IDesignation>('Designation', DesignationSchema);

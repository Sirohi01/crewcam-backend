import mongoose, { Schema } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface ICustomField extends ITenantScoped, IAuditable {
  departmentId: mongoose.Types.ObjectId;
  label: string;
  apiKey: string;
  group: string;
  dataType: string;
  options?: string[];
  defaultValue?: string;
  description?: string;
  mandatory: boolean;
  showInReports: boolean;
  showInProfile: boolean;
  showInDirectory: boolean;
  applicableFor: string;
  fieldOrder: number;
  status: string;
}

const CustomFieldSchema = new Schema<ICustomField>({
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
  label: { type: String, required: true },
  apiKey: { type: String, required: true },
  group: { type: String, required: true },
  dataType: { type: String, required: true },
  options: [{ type: String }],
  defaultValue: { type: String },
  description: { type: String },
  mandatory: { type: Boolean, default: false },
  showInReports: { type: Boolean, default: true },
  showInProfile: { type: Boolean, default: true },
  showInDirectory: { type: Boolean, default: false },
  applicableFor: { type: String, enum: ['Employees', 'Departments', 'Both'], default: 'Departments' },
  fieldOrder: { type: Number, default: 0 },
  status: { type: String, enum: ['Active', 'Draft'], default: 'Active' },
}, { timestamps: true });

CustomFieldSchema.plugin(tenantPlugin);
CustomFieldSchema.plugin(auditPlugin);

// Ensure apiKey is unique per department per tenant
CustomFieldSchema.index({ departmentId: 1, apiKey: 1, companyId: 1 }, { unique: true });

export const CustomField = mongoose.model<ICustomField>('CustomField', CustomFieldSchema);

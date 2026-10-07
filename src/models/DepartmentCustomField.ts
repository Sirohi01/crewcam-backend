import mongoose, { Document, Schema } from 'mongoose';

export interface IDepartmentCustomField extends Document {
  tenantId: mongoose.Types.ObjectId;
  departmentId: mongoose.Types.ObjectId;
  name: string;
  code: string;
  fieldType: string;
  isRequired: boolean;
  options?: string[];
  status: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentCustomFieldSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    fieldType: { type: String, required: true, default: 'Text' },
    isRequired: { type: Boolean, default: false },
    options: [{ type: String }],
    status: { type: String, required: true, enum: ['Active', 'Inactive'], default: 'Active' },
    description: { type: String },
  },
  { timestamps: true }
);

DepartmentCustomFieldSchema.index({ tenantId: 1, departmentId: 1, code: 1 }, { unique: true });

export default mongoose.models.DepartmentCustomField || mongoose.model<IDepartmentCustomField>('DepartmentCustomField', DepartmentCustomFieldSchema);

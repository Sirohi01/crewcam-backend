import mongoose, { Document, Schema } from 'mongoose';

export interface IDepartmentPolicy extends Document {
  tenantId: mongoose.Types.ObjectId;
  departmentId: mongoose.Types.ObjectId;
  name: string;
  code: string;
  fileUrl?: string;
  status: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentPolicySchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    fileUrl: { type: String },
    status: { type: String, required: true, enum: ['Active', 'Inactive'], default: 'Active' },
    description: { type: String },
  },
  { timestamps: true }
);

DepartmentPolicySchema.index({ tenantId: 1, departmentId: 1, code: 1 }, { unique: true });

export default mongoose.models.DepartmentPolicy || mongoose.model<IDepartmentPolicy>('DepartmentPolicy', DepartmentPolicySchema);

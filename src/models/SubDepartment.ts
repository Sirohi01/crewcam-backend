import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface ISubDepartment extends ITenantScoped, IAuditable {
  name: string;
  code: string;
  department: string;
  parentDepartment?: string;
  hodEmployeeId?: mongoose.Types.ObjectId;
  description?: string;
  isActive: boolean;
  // Added by Mongoose `timestamps: true`
  createdAt: Date;
  updatedAt: Date;
}

const SubDepartmentSchema = new Schema<ISubDepartment>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true },
    department: { type: String, required: true },
    parentDepartment: { type: String },
    hodEmployeeId: { type: Schema.Types.ObjectId, ref: 'User' },
    description: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SubDepartmentSchema.plugin(tenantPlugin);
SubDepartmentSchema.plugin(auditPlugin);

export default mongoose.model<ISubDepartment>('SubDepartment', SubDepartmentSchema);

import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IDesignation extends ITenantScoped, IAuditable {
  name: string;
  code: string;
  level?: number;
  departmentId: mongoose.Types.ObjectId;
  reportingToEmployeeId?: mongoose.Types.ObjectId;
  isActive: boolean;
}

const DesignationSchema = new Schema<IDesignation>({
  name: { type: String, required: true },
  code: { type: String, required: true },
  level: { type: Number },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
  reportingToEmployeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

DesignationSchema.plugin(tenantPlugin);
DesignationSchema.plugin(auditPlugin);

export const Designation = mongoose.model<IDesignation>('Designation', DesignationSchema);

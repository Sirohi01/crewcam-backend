import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IJobFamily extends ITenantScoped, IAuditable {
  name: string;
  code: string;
  description?: string;
  parentFamilyId?: mongoose.Types.ObjectId;
  businessUnit?: string;
  keyResponsibilities?: string;
  isActive: boolean;
}

const JobFamilySchema = new Schema<IJobFamily>({
  name: { type: String, required: true },
  code: { type: String, required: true },
  description: { type: String },
  parentFamilyId: { type: Schema.Types.ObjectId, ref: 'JobFamily' },
  businessUnit: { type: String },
  keyResponsibilities: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

JobFamilySchema.plugin(tenantPlugin);
JobFamilySchema.plugin(auditPlugin);

export const JobFamily = mongoose.model<IJobFamily>('JobFamily', JobFamilySchema);

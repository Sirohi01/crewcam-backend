import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IJobFamily extends ITenantScoped, IAuditable {
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  parentFamily?: mongoose.Types.ObjectId;
  businessUnitId?: mongoose.Types.ObjectId;
  keyResponsibilities?: string;
}

const JobFamilySchema = new Schema<IJobFamily>({
  name: { type: String, required: true },
  code: { type: String, required: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  parentFamily: { type: Schema.Types.ObjectId, ref: 'JobFamily' },
  businessUnitId: { type: Schema.Types.ObjectId, ref: 'BusinessUnit' },
  keyResponsibilities: { type: String },
}, { timestamps: true });

JobFamilySchema.plugin(tenantPlugin);
JobFamilySchema.plugin(auditPlugin);

export const JobFamily = mongoose.model<IJobFamily>('JobFamily', JobFamilySchema);

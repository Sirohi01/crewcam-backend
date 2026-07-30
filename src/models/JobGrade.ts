import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IJobGrade extends ITenantScoped, IAuditable {
  name: string;
  code: string;
  description?: string;
  level?: string;
  isActive: boolean;
  jobFamily?: mongoose.Types.ObjectId;
  parentGrade?: mongoose.Types.ObjectId;
  payRange?: string;
  ctcRangeMin?: string;
  ctcRangeMax?: string;
  probationPeriod?: string;
}

const JobGradeSchema = new Schema<IJobGrade>({
  name: { type: String, required: true },
  code: { type: String, required: true },
  description: { type: String },
  level: { type: String },
  isActive: { type: Boolean, default: true },
  jobFamily: { type: Schema.Types.ObjectId, ref: 'JobFamily' },
  parentGrade: { type: Schema.Types.ObjectId, ref: 'JobGrade' },
  payRange: { type: String },
  ctcRangeMin: { type: String },
  ctcRangeMax: { type: String },
  probationPeriod: { type: String },
}, { timestamps: true });

JobGradeSchema.plugin(tenantPlugin);
JobGradeSchema.plugin(auditPlugin);

export const JobGrade = mongoose.model<IJobGrade>('JobGrade', JobGradeSchema);

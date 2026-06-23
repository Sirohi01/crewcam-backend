import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IDegree extends ITenantScoped, IAuditable {
  name: string;
  code?: string;
  level?: string;
  isActive: boolean;
}

const DegreeSchema = new Schema<IDegree>({
  name: { type: String, required: true },
  code: { type: String },
  level: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

DegreeSchema.plugin(tenantPlugin);
DegreeSchema.plugin(auditPlugin);

export const Degree = mongoose.model<IDegree>('Degree', DegreeSchema);

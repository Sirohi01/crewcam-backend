import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';
export interface IKpaLibrary extends ITenantScoped, IAuditable, Document {
  title: string;
  designation?: string;
  departmentId?: Types.ObjectId;
  kraReport: string;
  kpis: string[];
  source: 'manual' | 'ai-generated';
}

const KpaLibrarySchema = new Schema<IKpaLibrary>({
  title: { type: String, required: true },
  designation: { type: String },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
  kraReport: { type: String, required: true },
  kpis: [{ type: String }],
  source: { type: String, enum: ['manual', 'ai-generated'], default: 'manual' },
}, { timestamps: true });

KpaLibrarySchema.plugin(tenantPlugin);
KpaLibrarySchema.plugin(auditPlugin);

export const KpaLibrary = mongoose.model<IKpaLibrary>('KpaLibrary', KpaLibrarySchema);

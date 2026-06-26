import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';
export interface IJdLibrary extends ITenantScoped, IAuditable, Document {
  title: string;
  designation?: string;
  departmentId?: Types.ObjectId;
  jobDescriptionSummary: string;
  keyResponsibilities: string[];
  qualificationReq?: string;
  experienceReq?: string;
  technicalSkills?: string;
  softSkills?: string;
  source: 'manual' | 'ai-generated';
}

const JdLibrarySchema = new Schema<IJdLibrary>({
  title: { type: String, required: true },
  designation: { type: String },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
  jobDescriptionSummary: { type: String, required: true },
  keyResponsibilities: [{ type: String }],
  qualificationReq: { type: String },
  experienceReq: { type: String },
  technicalSkills: { type: String },
  softSkills: { type: String },
  source: { type: String, enum: ['manual', 'ai-generated'], default: 'manual' },
}, { timestamps: true });

JdLibrarySchema.plugin(tenantPlugin);
JdLibrarySchema.plugin(auditPlugin);

export const JdLibrary = mongoose.model<IJdLibrary>('JdLibrary', JdLibrarySchema);

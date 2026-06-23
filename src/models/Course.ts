import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';
import { auditPlugin } from './plugins/auditPlugin';

export interface ICourse extends Document {
  tenantId: Types.ObjectId;
  title: string;
  description: string;
  modules: {
    title: string;
    materialsUrl: string;
    duration?: number;
  }[];
  mandatoryForRoles?: Types.ObjectId[]; // Array of Role IDs
  mandatoryForDepartments?: Types.ObjectId[]; // Array of Department IDs
  isActive: boolean;
  createdBy: Types.ObjectId;
}

const courseSchema = new Schema<ICourse>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  modules: [{
    title: { type: String, required: true },
    materialsUrl: { type: String, required: true },
    duration: { type: Number }
  }],
  mandatoryForRoles: [{ type: Schema.Types.ObjectId, ref: 'CompanyRole' }],
  mandatoryForDepartments: [{ type: Schema.Types.ObjectId, ref: 'Department' }],
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, {
  timestamps: true
});

courseSchema.plugin(tenantPlugin);
courseSchema.plugin(auditPlugin);

export const Course = mongoose.model<ICourse>('Course', courseSchema);

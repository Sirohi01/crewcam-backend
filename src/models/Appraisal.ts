import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAppraisal extends Document {
  tenantId: Types.ObjectId;
  employeeId: Types.ObjectId;
  cycle: string; // e.g., 'Q1 2026', 'Annual 2026'
  selfRating: number;
  selfComments: string;
  hodRating?: number;
  hodComments?: string;
  hodId?: Types.ObjectId;
  hrRating?: number;
  hrComments?: string;
  hrId?: Types.ObjectId;
  status: 'Pending' | 'Self_Submitted' | 'HOD_Reviewed' | 'HR_Finalized';
}

const appraisalSchema = new Schema<IAppraisal>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  cycle: { type: String, required: true },
  selfRating: { type: Number, min: 1, max: 5 },
  selfComments: { type: String },
  hodRating: { type: Number, min: 1, max: 5 },
  hodComments: { type: String },
  hodId: { type: Schema.Types.ObjectId, ref: 'User' },
  hrRating: { type: Number, min: 1, max: 5 },
  hrComments: { type: String },
  hrId: { type: Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['Pending', 'Self_Submitted', 'HOD_Reviewed', 'HR_Finalized'], default: 'Pending' }
}, {
  timestamps: true
});

import { tenantPlugin } from './plugins/tenantPlugin';
appraisalSchema.plugin(tenantPlugin);

export const Appraisal = mongoose.model<IAppraisal>('Appraisal', appraisalSchema);

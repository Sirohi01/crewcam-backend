import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ICandidate extends Document {
  tenantId: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobRole: string;
  departmentId?: Types.ObjectId;
  status: 'Applied' | 'Screening' | 'Interviewing' | 'Offered' | 'Hired' | 'Rejected';
  resumeUrl?: string;
  resumeUpdatedAt?: Date;
  source?: string;
  rating?: number;
  comments?: string;
  profileImageUrl?: string;
  applicationDetails?: Record<string, unknown>;
}

const candidateSchema = new Schema<ICandidate>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  jobRole: { type: String, required: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
  status: {
    type: String,
    enum: ['Applied', 'Screening', 'Interviewing', 'Offered', 'Hired', 'Rejected'],
    default: 'Applied'
  },
  resumeUrl: { type: String },
  resumeUpdatedAt: { type: Date },
  source: { type: String },
  rating: { type: Number, min: 1, max: 5 },
  comments: { type: String }
  , profileImageUrl: { type: String }
  , applicationDetails: { type: Schema.Types.Mixed }
}, {
  timestamps: true
});

import { tenantPlugin } from './plugins/tenantPlugin';
candidateSchema.plugin(tenantPlugin);

export const Candidate = mongoose.model<ICandidate>('Candidate', candidateSchema);

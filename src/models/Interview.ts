import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IInterviewQuestion {
  question: string;
  suggestedAnswer?: string;
}

export interface IInterview extends Document {
  tenantId: Types.ObjectId;
  candidateId: Types.ObjectId;
  interviewerId: Types.ObjectId;
  roundType: 'Walk-In' | 'Telephonic' | 'Technical' | 'HR' | 'HR & HOD' | 'Managerial' | 'Final';
  scheduledDate: Date;
  status: 'Scheduled' | 'Completed' | 'Cancelled' | 'No_Show';
  rating?: number;
  feedback?: string;
  mode?: 'In-person' | 'Phone' | 'Video';
  location?: string;
  meetingLink?: string;
  interviewQuestions?: IInterviewQuestion[];
}

const interviewSchema = new Schema<IInterview>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  interviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  roundType: { 
    type: String, 
    enum: ['Walk-In', 'Telephonic', 'Technical', 'HR', 'HR & HOD', 'Managerial', 'Final'], 
    required: true 
  },
  scheduledDate: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['Scheduled', 'Completed', 'Cancelled', 'No_Show'], 
    default: 'Scheduled' 
  },
  rating: { type: Number, min: 1, max: 5 },
  feedback: { type: String },
  mode: { type: String, enum: ['In-person', 'Phone', 'Video'], default: 'Video' },
  location: { type: String },
  meetingLink: { type: String },
  interviewQuestions: [{
    question: { type: String, required: true },
    suggestedAnswer: { type: String },
  }]
}, {
  timestamps: true
});

import { tenantPlugin } from './plugins/tenantPlugin';
interviewSchema.plugin(tenantPlugin);

export const Interview = mongoose.model<IInterview>('Interview', interviewSchema);

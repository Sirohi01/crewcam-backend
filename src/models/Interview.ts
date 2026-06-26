import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAnswerAnalysis {
  verdict: 'strong' | 'adequate' | 'weak' | 'no_answer';
  reasoning: string;
  followUpSuggestion?: string;
}

export interface IInterviewQuestion {
  question: string;
  suggestedAnswer?: string;
  recordingUrl?: string;
  recordingPublicId?: string;
  transcript?: string;
  answerAnalysis?: IAnswerAnalysis;
  answeredAt?: Date;
}

export interface IOverallAnalysis {
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendation: 'strong_hire' | 'hire' | 'lean_no' | 'no_hire';
  generatedAt: Date;
}

export interface IInterview extends Document {
  tenantId: Types.ObjectId;
  candidateId: Types.ObjectId;
  interviewerId: Types.ObjectId;
  roundType: 'Walk-In' | 'Telephonic' | 'Technical' | 'HR' | 'HR & HOD' | 'Managerial' | 'Final';
  scheduledDate: Date;
  status: 'Scheduled' | 'In_Progress' | 'Completed' | 'Cancelled' | 'No_Show';
  rating?: number;
  feedback?: string;
  mode?: 'In-person' | 'Phone' | 'Video';
  location?: string;
  meetingLink?: string;
  interviewQuestions?: IInterviewQuestion[];
  overallAnalysis?: IOverallAnalysis;
  recordingSessionStartedAt?: Date;
  recordingSessionEndedAt?: Date;
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
    enum: ['Scheduled', 'In_Progress', 'Completed', 'Cancelled', 'No_Show'],
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
    recordingUrl: { type: String },
    recordingPublicId: { type: String },
    transcript: { type: String },
    answerAnalysis: {
      verdict: { type: String, enum: ['strong', 'adequate', 'weak', 'no_answer'] },
      reasoning: { type: String },
      followUpSuggestion: { type: String },
    },
    answeredAt: { type: Date },
  }],
  overallAnalysis: {
    summary: { type: String },
    strengths: [{ type: String }],
    concerns: [{ type: String }],
    recommendation: { type: String, enum: ['strong_hire', 'hire', 'lean_no', 'no_hire'] },
    generatedAt: { type: Date },
  },
  recordingSessionStartedAt: { type: Date },
  recordingSessionEndedAt: { type: Date },
}, {
  timestamps: true
});

import { tenantPlugin } from './plugins/tenantPlugin';
interviewSchema.plugin(tenantPlugin);

export const Interview = mongoose.model<IInterview>('Interview', interviewSchema);

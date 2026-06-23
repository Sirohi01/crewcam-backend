import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IEvaluationCriterion {
  criterion: string;
  score: number;
  remarks?: string;
}

export interface IInterviewEvaluation extends ITenantScoped {
  candidateId: Types.ObjectId;
  interviewId?: Types.ObjectId;
  interviewerId: Types.ObjectId;
  roundType: 'Telephonic' | 'Technical' | 'HR' | 'Managerial' | 'Final';
  evaluationCriteria: IEvaluationCriterion[];
  overallScore?: number;
  recommendation: 'Strongly Recommend' | 'Recommend' | 'Neutral' | 'Not Recommend' | 'Strongly Reject';
  strengths?: string;
  weaknesses?: string;
  comments?: string;
  candidateSnapshot?: Record<string, string>;
  competencyRatings?: IEvaluationCriterion[];
  improvementAreas?: string;
  proposedSalaryMin?: number;
  proposedSalaryMax?: number;
  earliestJoiningDate?: Date;
  interviewerDecision?: string;
  interviewerRemarks?: string;
  hrStatus?: string;
  hrName?: string;
  hrRemarks?: string;
  hodDecision?: string;
  hodName?: string;
  hodRemarks?: string;
}

const interviewEvaluationSchema = new Schema<IInterviewEvaluation>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  interviewId: { type: Schema.Types.ObjectId, ref: 'Interview' },
  interviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  roundType: { type: String, enum: ['Telephonic', 'Technical', 'HR', 'Managerial', 'Final'], required: true },
  evaluationCriteria: [{
    criterion: { type: String, required: true },
    score: { type: Number, min: 1, max: 5, required: true },
    remarks: { type: String }
  }],
  overallScore: { type: Number, min: 1, max: 5 },
  recommendation: {
    type: String,
    enum: ['Strongly Recommend', 'Recommend', 'Neutral', 'Not Recommend', 'Strongly Reject'],
    required: true
  },
  strengths: { type: String },
  weaknesses: { type: String },
  comments: { type: String }
  ,candidateSnapshot: { type: Schema.Types.Mixed }
  ,competencyRatings: [{
    criterion: { type: String },
    score: { type: Number, min: 1, max: 5 },
    remarks: { type: String }
  }]
  ,improvementAreas: { type: String }
  ,proposedSalaryMin: { type: Number }
  ,proposedSalaryMax: { type: Number }
  ,earliestJoiningDate: { type: Date }
  ,interviewerDecision: { type: String }
  ,interviewerRemarks: { type: String }
  ,hrStatus: { type: String }
  ,hrName: { type: String }
  ,hrRemarks: { type: String }
  ,hodDecision: { type: String }
  ,hodName: { type: String }
  ,hodRemarks: { type: String }
}, { timestamps: true });

interviewEvaluationSchema.plugin(tenantPlugin);

export const InterviewEvaluation = mongoose.model<IInterviewEvaluation>('InterviewEvaluation', interviewEvaluationSchema);

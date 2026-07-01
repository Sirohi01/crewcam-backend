import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IProbationReview extends ITenantScoped {
  candidateName?: string;
  uniqueId?: string;
  department?: string;
  designation?: string;
  joiningDate?: string;
  reportingManager?: string;
  reportingManagerSignatureName?: string;
  reportingManagerDate?: string;

  employeeId: Types.ObjectId;
  reviewPeriodStart?: Date;
  reviewPeriodEnd?: Date;
  reviewerId: Types.ObjectId;
  ratings: {
    parameter: string;
    score: number;
    comments?: string;
  }[];
  overallRating?: number;
  decision: 'Pending' | 'Confirmed' | 'Extended' | 'Terminated';
  extensionMonths?: number;
  comments?: string;
  reviewDate?: Date;
}

const probationReviewSchema = new Schema<IProbationReview>({
  candidateName: { type: String },
  uniqueId: { type: String },
  department: { type: String },
  designation: { type: String },
  joiningDate: { type: String },
  reportingManager: { type: String },
  reportingManagerSignatureName: { type: String },
  reportingManagerDate: { type: String },

  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reviewPeriodStart: { type: Date },
  reviewPeriodEnd: { type: Date },
  reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  ratings: [{
    parameter: { type: String, required: true },
    score: { type: Number, min: 1, max: 5, required: true },
    comments: { type: String }
  }],
  overallRating: { type: Number, min: 1, max: 5 },
  decision: { type: String, enum: ['Pending', 'Confirmed', 'Extended', 'Terminated'], default: 'Pending' },
  extensionMonths: { type: Number },
  comments: { type: String },
  reviewDate: { type: Date }
}, { timestamps: true });

probationReviewSchema.plugin(tenantPlugin);

export const ProbationReview = mongoose.model<IProbationReview>('ProbationReview', probationReviewSchema);

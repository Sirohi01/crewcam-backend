import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IHiringPerformanceEval extends ITenantScoped {
  employeeId: Types.ObjectId;
  evaluationPeriod?: string;
  evaluatorId: Types.ObjectId;
  kpis: {
    metric: string;
    target?: string;
    achieved?: string;
    score: number;
  }[];
  overallScore?: number;
  strengths?: string;
  areasOfImprovement?: string;
  recommendation: 'Confirm' | 'Extend Probation' | 'PIP' | 'Terminate';
  reviewDate?: Date;
}

const hiringPerformanceEvalSchema = new Schema<IHiringPerformanceEval>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  evaluationPeriod: { type: String },
  evaluatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  kpis: [{
    metric: { type: String, required: true },
    target: { type: String },
    achieved: { type: String },
    score: { type: Number, min: 1, max: 5, required: true }
  }],
  overallScore: { type: Number, min: 1, max: 5 },
  strengths: { type: String },
  areasOfImprovement: { type: String },
  recommendation: { type: String, enum: ['Confirm', 'Extend Probation', 'PIP', 'Terminate'], default: 'Confirm' },
  reviewDate: { type: Date }
}, { timestamps: true, collection: 'performanceEvals' });

hiringPerformanceEvalSchema.plugin(tenantPlugin);

export const HiringPerformanceEval = mongoose.model<IHiringPerformanceEval>('HiringPerformanceEval', hiringPerformanceEvalSchema);

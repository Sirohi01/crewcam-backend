import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface ICTCBreakup extends ITenantScoped {
  candidateName?: string;
  dear?: string;
  department?: string;
  position?: string;
  workLocation?: string;
  reportingTo?: string;
  effectiveDate?: string;

  candidateId: Types.ObjectId;
  annualCTC: number;
  currency: string;
  breakup: {
    basic: number;
    hra: number;
    conveyance: number;
    medicalAllowance: number;
    specialAllowance: number;
    pfEmployer: number;
    pfEmployee: number;
    gratuity: number;
    bonus: number;
    otherAllowances: number;
  };
  monthlyGross?: number;
  monthlyTakeHome?: number;
  preparedBy: Types.ObjectId;
  status: 'Draft' | 'Finalized';
}

const ctcBreakupSchema = new Schema<ICTCBreakup>({
  candidateName: { type: String },
  dear: { type: String },
  department: { type: String },
  position: { type: String },
  workLocation: { type: String },
  reportingTo: { type: String },
  effectiveDate: { type: String },

  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  annualCTC: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  breakup: {
    basic: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    conveyance: { type: Number, default: 0 },
    medicalAllowance: { type: Number, default: 0 },
    specialAllowance: { type: Number, default: 0 },
    pfEmployer: { type: Number, default: 0 },
    pfEmployee: { type: Number, default: 0 },
    gratuity: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    otherAllowances: { type: Number, default: 0 }
  },
  monthlyGross: { type: Number },
  monthlyTakeHome: { type: Number },
  preparedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['Draft', 'Finalized'], default: 'Draft' }
}, { timestamps: true });

ctcBreakupSchema.plugin(tenantPlugin);

export const CTCBreakup = mongoose.model<ICTCBreakup>('CTCBreakup', ctcBreakupSchema);

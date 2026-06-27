import mongoose, { Schema, Document } from 'mongoose';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export type LeadStage = 'LEAD' | 'DEMO_SCHEDULED' | 'PROPOSAL_SENT' | 'QUOTATION_APPROVED' | 'WON' | 'LOST';

export interface ILeadStageHistoryEntry {
  fromStage?: LeadStage;
  toStage: LeadStage;
  note?: string;
  changedBy?: mongoose.Types.ObjectId;
  changedAt: Date;
}

export interface ILead extends Document, IAuditable {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  source: 'WEBSITE' | 'REFERRAL' | 'OUTBOUND' | 'EVENT' | 'OTHER';
  // Mirrors the first 4 stages of the company lifecycle (see Tenant.LIFECYCLE_STATUSES) —
  // a lead converted at QUOTATION_APPROVED becomes a Tenant and continues there.
  stage: LeadStage;
  stageHistory: ILeadStageHistoryEntry[];
  estimatedValue: number;
  currency: 'INR' | 'USD';
  notes?: string;
  lostReason?: string;
  convertedTenantId?: mongoose.Types.ObjectId;
  lastFollowUpReminderAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema = new Schema<ILead>({
  companyName: { type: String, required: true },
  contactName: { type: String, required: true },
  contactEmail: { type: String, required: true },
  contactPhone: { type: String },
  source: { type: String, enum: ['WEBSITE', 'REFERRAL', 'OUTBOUND', 'EVENT', 'OTHER'], default: 'OTHER' },
  stage: { type: String, enum: ['LEAD', 'DEMO_SCHEDULED', 'PROPOSAL_SENT', 'QUOTATION_APPROVED', 'WON', 'LOST'], default: 'LEAD' },
  stageHistory: [{
    fromStage: { type: String, enum: ['LEAD', 'DEMO_SCHEDULED', 'PROPOSAL_SENT', 'QUOTATION_APPROVED', 'WON', 'LOST'] },
    toStage: { type: String, enum: ['LEAD', 'DEMO_SCHEDULED', 'PROPOSAL_SENT', 'QUOTATION_APPROVED', 'WON', 'LOST'], required: true },
    note: { type: String },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
  }],
  estimatedValue: { type: Number, default: 0 },
  currency: { type: String, enum: ['INR', 'USD'], default: 'INR' },
  notes: { type: String },
  lostReason: { type: String },
  convertedTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
  lastFollowUpReminderAt: { type: Date },
}, { timestamps: true });

LeadSchema.plugin(auditPlugin);

export const Lead = mongoose.model<ILead>('Lead', LeadSchema);

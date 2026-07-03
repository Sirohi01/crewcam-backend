import mongoose, { Schema, Document } from 'mongoose';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export type LeadStage = 'LEAD' | 'DEMO_SCHEDULED' | 'PROPOSAL_SENT' | 'QUOTATION_APPROVED' | 'WON' | 'LOST';
export type LeadTemperature = 'NEW' | 'WARM' | 'HOT' | 'COLD';
export type LeadType = 'DOMESTIC' | 'INTERNATIONAL';

export interface ILeadStageHistoryEntry {
  fromStage?: LeadStage;
  toStage: LeadStage;
  note?: string;
  changedBy?: mongoose.Types.ObjectId;
  changedAt: Date;
}

export interface ILeadActivityEntry {
  note: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface ILeadAdditionalContact {
  title?: string;
  firstName?: string;
  surname?: string;
  designation?: string;
  email?: string;
  phone?: string;
  alternatePhone?: string;
}

export interface ILead extends Document, IAuditable {
  companyName: string;
  leadType: LeadType;
  typeOfBusiness?: string;
  industry?: string;
  companyWebsite?: string;
  companyEmail?: string;
  landlineNo?: string;
  fullAddress?: string;
  country?: string;
  pinCode?: string;
  state?: string;
  city?: string;
  contactTitle?: string;
  contactName: string;
  contactSurname?: string;
  contactDesignation?: string;
  contactEmail: string;
  contactPhone?: string;
  alternateContactPhone?: string;
  additionalContacts: ILeadAdditionalContact[];
  // Free text, not a fixed enum — the set of valid sources is managed via LeadMasterData
  // (type: 'SOURCE') so admins can add custom sources without a schema change.
  source: string;
  leadDate: Date;
  assignedTo?: mongoose.Types.ObjectId;
  followUpDate?: Date;
  // Manual engagement rating, independent of pipeline stage — lets admins segment leads
  // (e.g. "call hot leads first") without that affecting where they sit in the pipeline.
  temperature: LeadTemperature;
  // Mirrors the first 4 stages of the company lifecycle (see Tenant.LIFECYCLE_STATUSES) —
  // a lead converted at QUOTATION_APPROVED becomes a Tenant and continues there.
  stage: LeadStage;
  stageHistory: ILeadStageHistoryEntry[];
  // Freeform conversation/call notes — separate from stageHistory, which only
  // records discussion context tied to a stage change.
  activityLog: ILeadActivityEntry[];
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
  leadType: { type: String, enum: ['DOMESTIC', 'INTERNATIONAL'], default: 'DOMESTIC' },
  typeOfBusiness: { type: String },
  industry: { type: String },
  companyWebsite: { type: String },
  companyEmail: { type: String },
  landlineNo: { type: String },
  fullAddress: { type: String },
  country: { type: String, default: 'India' },
  pinCode: { type: String },
  state: { type: String },
  city: { type: String },
  contactTitle: { type: String },
  contactName: { type: String, required: true },
  contactSurname: { type: String },
  contactDesignation: { type: String },
  contactEmail: { type: String, required: true },
  contactPhone: { type: String },
  alternateContactPhone: { type: String },
  additionalContacts: [{
    title: { type: String },
    firstName: { type: String },
    surname: { type: String },
    designation: { type: String },
    email: { type: String },
    phone: { type: String },
    alternatePhone: { type: String },
  }],
  source: { type: String, default: 'OTHER' },
  leadDate: { type: Date, default: Date.now },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  followUpDate: { type: Date },
  temperature: { type: String, enum: ['NEW', 'WARM', 'HOT', 'COLD'], default: 'NEW', index: true },
  stage: { type: String, enum: ['LEAD', 'DEMO_SCHEDULED', 'PROPOSAL_SENT', 'QUOTATION_APPROVED', 'WON', 'LOST'], default: 'LEAD' },
  stageHistory: [{
    fromStage: { type: String, enum: ['LEAD', 'DEMO_SCHEDULED', 'PROPOSAL_SENT', 'QUOTATION_APPROVED', 'WON', 'LOST'] },
    toStage: { type: String, enum: ['LEAD', 'DEMO_SCHEDULED', 'PROPOSAL_SENT', 'QUOTATION_APPROVED', 'WON', 'LOST'], required: true },
    note: { type: String },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
  }],
  activityLog: [{
    note: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
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

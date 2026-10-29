import mongoose, { Schema, Document, Types } from 'mongoose';
import './Designation';
import './Department';
import './Branch';
import './User';

export interface IManpowerRequest extends Document {
  tenantId: Types.ObjectId;
  jobTitle: string;
  departmentId?: Types.ObjectId;
  requestDate?: Date;
  locationBranchId?: Types.ObjectId;
  designation?: string;
  designationId?: Types.ObjectId;
  workLocation?: string;
  reportingTo?: Types.ObjectId;
  employmentTypes?: string[];
  hiringReasons?: string[];
  jobDescriptionSummary?: string;
  kraReport?: string;
  replacementName?: string;
  detailedJustification?: string;
  keyResponsibilities?: string[];
  qualificationReq?: string;
  experienceReq?: string;
  technicalSkills?: string[];
  softSkills?: string[];
  numberOfPositions: number;
  employmentType: string;
  reasonForHiring: string;
  priority: string;
  jobCode?: string;
  attachments?: string[];
  publishChannels?: string[];
  applicationLastDate?: Date;
  applicationEmail?: string;
  whoCanApply?: string;
  genderPreference?: string;
  relocationAssistance?: string;
  preferredQualifications?: string[];
  certifications?: string[];
  languages?: string[];
  replacementReason?: string;
  lastWorkingDate?: Date;
  impact?: string;
  replacedEmployeeId?: Types.ObjectId;
  budgetCTC?: number;
  salaryCtcMin?: number;
  salaryCtcMax?: number;
  salaryCurrency?: string;
  jobCategory?: string;
  workMode?: string;
  noticePeriod?: string;
  travelRequired?: string;
  shiftTiming?: string;
  probationPeriod?: string;
  otherNotes?: string;
  budgetApprovedBy?: Types.ObjectId;
  benefits?: string[];
  otherBenefits?: string;
  requiredJoiningDate?: Date;
  isUrgent?: boolean;
  requestReceivedOn?: Date;
  recruitmentStartDate?: Date;
  recruitmentStatus?: string;
  declarationAccepted?: boolean;
  justification?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedBy?: Types.ObjectId;
  approvedBy?: Types.ObjectId;
  pendingApprovalFrom?: Types.ObjectId;
  rejectionReason?: string;
  approvalDate?: Date;
  departmentHeadSignature?: string;
  directorApprovalSignature?: string;
  hrHeadSignature?: string;
  pdfUrl?: string;

  // Set when this request mirrors a job pulled in from a tenant's own career site
  // (see services/careerSiteSync.service.ts) instead of being authored in HR-CRM.
  sourceSystem?: 'manual' | 'career-site';
  externalJobId?: string;
  lastSyncedAt?: Date;
  // Which of this tenant's (possibly several) connected career-site Integrations this
  // job was pulled from / should be scoped to — see careerSiteSync.service.ts.
  sourceSite?: string;
}

const manpowerRequestSchema = new Schema<IManpowerRequest>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  jobTitle: { type: String, required: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
  requestDate: { type: Date },
  locationBranchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  designation: { type: String },
  designationId: { type: Schema.Types.ObjectId, ref: 'Designation' },
  workLocation: { type: String },
  reportingTo: { type: Schema.Types.ObjectId, ref: 'User' },
  employmentTypes: [{ type: String }],
  hiringReasons: [{ type: String }],
  jobDescriptionSummary: { type: String },
  kraReport: { type: String },
  replacementName: { type: String },
  detailedJustification: { type: String },
  keyResponsibilities: [{ type: String }],
  qualificationReq: { type: String },
  experienceReq: { type: String },
  technicalSkills: [{ type: String }],
  softSkills: [{ type: String }],
  numberOfPositions: { type: Number, required: true, default: 1 },
  employmentType: { type: String, required: true, default: 'Full-time' },
  reasonForHiring: { type: String, required: true, default: 'New Position' },
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
  jobCode: { type: String },
  attachments: [{ type: String }],
  publishChannels: [{ type: String }],
  applicationLastDate: { type: Date },
  applicationEmail: { type: String },
  whoCanApply: { type: String },
  genderPreference: { type: String },
  relocationAssistance: { type: String },
  preferredQualifications: [{ type: String }],
  certifications: [{ type: String }],
  languages: [{ type: String }],
  replacementReason: { type: String },
  lastWorkingDate: { type: Date },
  impact: { type: String },
  replacedEmployeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  budgetCTC: { type: Number },
  salaryCtcMin: { type: Number },
  salaryCtcMax: { type: Number },
  salaryCurrency: { type: String },
  jobCategory: { type: String },
  workMode: { type: String },
  noticePeriod: { type: String },
  travelRequired: { type: String },
  shiftTiming: { type: String },
  probationPeriod: { type: String },
  otherNotes: { type: String },
  budgetApprovedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  benefits: [{ type: String }],
  otherBenefits: { type: String },
  requiredJoiningDate: { type: Date },
  isUrgent: { type: Boolean, default: false },
  requestReceivedOn: { type: Date },
  recruitmentStartDate: { type: Date },
  recruitmentStatus: { type: String },
  declarationAccepted: { type: Boolean, default: false },
  justification: { type: String },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  pendingApprovalFrom: { type: Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String },
  approvalDate: { type: Date },
  departmentHeadSignature: { type: String },
  directorApprovalSignature: { type: String },
  hrHeadSignature: { type: String },
  pdfUrl: { type: String },

  sourceSystem: { type: String, enum: ['manual', 'career-site'], default: 'manual' },
  externalJobId: { type: String },
  lastSyncedAt: { type: Date },
  sourceSite: { type: String },
}, {
  timestamps: true
});

// One mirrored row per (tenant, site, remote job) — lets a re-sync upsert instead of duplicating,
// and keeps two different connected sites from colliding if they happen to reuse the same id.
manpowerRequestSchema.index({ tenantId: 1, sourceSite: 1, externalJobId: 1 }, { unique: true, sparse: true });

import { tenantPlugin } from './plugins/tenantPlugin';
import { auditPlugin } from './plugins/auditPlugin';

manpowerRequestSchema.plugin(tenantPlugin);
manpowerRequestSchema.plugin(auditPlugin);

export const ManpowerRequest = mongoose.model<IManpowerRequest>('ManpowerRequest', manpowerRequestSchema);

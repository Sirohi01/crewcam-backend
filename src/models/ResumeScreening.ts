import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';
import { encrypt, decrypt } from '../utils/encryption';

/**
 * One row per screening run (re-running keeps history, never overwrites — per
 * docs/hiring/12_AI_RESUME_SCREENING.md). Advisory only: nothing in this codebase
 * reads fitScore to auto-change Candidate.status (docs/02_ARCHITECTURE_AND_SECURITY_BASELINE.md rule #4).
 */
export interface IResumeScreening extends ITenantScoped, IAuditable, Document {
  candidateId: Types.ObjectId;
  extractedText: string; // encrypted at rest, see pre-save hook below
  fitScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  experienceMatch: 'under' | 'match' | 'over';
  redFlags: string[];
  summary: string;
  modelUsed: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  status: 'completed' | 'failed';
  failureReason?: string;
  getDecryptedText(): string;
}

const ResumeScreeningSchema = new Schema<IResumeScreening>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
  extractedText: { type: String, default: '' },
  fitScore: { type: Number, min: 0, max: 100, default: 0 },
  matchedSkills: [{ type: String }],
  missingSkills: [{ type: String }],
  experienceMatch: { type: String, enum: ['under', 'match', 'over'] },
  redFlags: [{ type: String }],
  summary: { type: String, default: '' },
  modelUsed: { type: String },
  promptTokens: { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
  costUsd: { type: Number, default: 0 },
  status: { type: String, enum: ['completed', 'failed'], required: true },
  failureReason: { type: String },
}, { timestamps: true });

ResumeScreeningSchema.index({ tenantId: 1, candidateId: 1, createdAt: -1 });

ResumeScreeningSchema.pre('save' as any, function (this: any, next: any) {
  if (this.isModified('extractedText') && this.extractedText && !this.extractedText.includes(':')) {
    this.extractedText = encrypt(this.extractedText);
  }
  next();
});

ResumeScreeningSchema.methods.getDecryptedText = function (): string {
  if (!this.extractedText) return '';
  try { return decrypt(this.extractedText); } catch { return ''; }
};

ResumeScreeningSchema.plugin(tenantPlugin);
ResumeScreeningSchema.plugin(auditPlugin);

export const ResumeScreening = mongoose.model<IResumeScreening>('ResumeScreening', ResumeScreeningSchema);

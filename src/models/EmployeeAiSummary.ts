import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';
import { encrypt, decrypt } from '../utils/encryption';

/**
 * On-demand only (HR clicks "Generate") — never a background job re-analyzing every
 * employee continuously. Per docs/roadmap/23C_PHASE_C2_AI_EMPLOYEE_SUMMARY_CHECKLIST.md,
 * keeps history like ResumeScreening (re-run creates a new row, never overwrites).
 */
export interface IEmployeeAiSummary extends ITenantScoped, IAuditable, Document {
  employeeId: Types.ObjectId;
  windowDays: number;
  summaryText: string; // encrypted at rest, same pattern as ResumeScreening.extractedText
  modelUsed: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  status: 'completed' | 'failed';
  failureReason?: string;
  getDecryptedSummary(): string;
}

const EmployeeAiSummarySchema = new Schema<IEmployeeAiSummary>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  windowDays: { type: Number, required: true },
  summaryText: { type: String, default: '' },
  modelUsed: { type: String },
  promptTokens: { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
  costUsd: { type: Number, default: 0 },
  status: { type: String, enum: ['completed', 'failed'], required: true },
  failureReason: { type: String },
}, { timestamps: true });

EmployeeAiSummarySchema.index({ tenantId: 1, employeeId: 1, createdAt: -1 });

EmployeeAiSummarySchema.pre('save' as any, function (this: any) {
  if (this.isModified('summaryText') && this.summaryText && !this.summaryText.includes(':')) {
    this.summaryText = encrypt(this.summaryText);
  }
});

EmployeeAiSummarySchema.methods.getDecryptedSummary = function (): string {
  if (!this.summaryText) return '';
  try { return decrypt(this.summaryText); } catch { return ''; }
};

EmployeeAiSummarySchema.plugin(tenantPlugin);
EmployeeAiSummarySchema.plugin(auditPlugin);

export const EmployeeAiSummary = mongoose.model<IEmployeeAiSummary>('EmployeeAiSummary', EmployeeAiSummarySchema);

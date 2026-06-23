import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IAiUsageLog extends ITenantScoped, IAuditable, Document {
  candidateId?: Types.ObjectId;
  feature: string;
  aiModel?: string;
  inputHash?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costINR: number;
  costUSD: number;
  status: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  metadata?: Record<string, any>;
}

const AiUsageLogSchema = new Schema<IAiUsageLog>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', index: true },
  feature: { type: String, required: true, index: true },
  aiModel: { type: String },
  inputHash: { type: String },
  promptTokens: { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  costINR: { type: Number, default: 0 },
  costUSD: { type: Number, default: 0 },
  status: { type: String, enum: ['SUCCESS', 'FAILURE', 'BLOCKED'], required: true, index: true },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

AiUsageLogSchema.index({ tenantId: 1, createdAt: -1 });

AiUsageLogSchema.plugin(tenantPlugin);
AiUsageLogSchema.plugin(auditPlugin);

export const AiUsageLog = mongoose.model<IAiUsageLog>('AiUsageLog', AiUsageLogSchema);

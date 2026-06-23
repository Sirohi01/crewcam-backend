import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export const STEP_STATUSES = ['pending', 'in_progress', 'completed', 'approved', 'rejected', 'skipped'] as const;
export type StepStatus = typeof STEP_STATUSES[number];

export interface IPipelineStep {
  stepNumber: number;
  key: string;
  status: StepStatus;
  checklist: IPipelineChecklistItem[];
  completedAt?: Date;
  approvedBy?: Types.ObjectId;
  refId?: Types.ObjectId;
}

export interface IPipelineChecklistItem {
  item: string;
  done: boolean;
  doneBy?: Types.ObjectId;
  doneAt?: Date;
}

export interface IHiringPipelineState extends ITenantScoped, IAuditable, Document {
  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  steps: IPipelineStep[];
  currentStep: number;
}

const PipelineChecklistItemSchema = new Schema<IPipelineChecklistItem>({
  item: { type: String, required: true },
  done: { type: Boolean, default: false },
  doneBy: { type: Schema.Types.ObjectId, ref: 'User' },
  doneAt: { type: Date },
}, { _id: false });

const PipelineStepSchema = new Schema<IPipelineStep>({
  stepNumber: { type: Number, required: true },
  key: { type: String, required: true },
  status: { type: String, enum: STEP_STATUSES, default: 'pending' },
  checklist: [PipelineChecklistItemSchema],
  completedAt: { type: Date },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  refId: { type: Schema.Types.ObjectId },
}, { _id: false });

const HiringPipelineStateSchema = new Schema<IHiringPipelineState>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  steps: [PipelineStepSchema],
  currentStep: { type: Number, default: 1 },
}, { timestamps: true });

HiringPipelineStateSchema.index({ tenantId: 1, candidateId: 1 }, { unique: true });

HiringPipelineStateSchema.plugin(tenantPlugin);
HiringPipelineStateSchema.plugin(auditPlugin);

export const HiringPipelineState = mongoose.model<IHiringPipelineState>('HiringPipelineState', HiringPipelineStateSchema);

import mongoose, { Schema, Document } from 'mongoose';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IOnboardingTask extends Document, IAuditable {
  tenantId: mongoose.Types.ObjectId;
  category: 'IMPLEMENTATION' | 'DEPLOYMENT';
  title: string;
  description?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
  assignee?: string;
  dueDate?: Date;
  completedAt?: Date;
}

const OnboardingTaskSchema = new Schema<IOnboardingTask>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  category: { type: String, enum: ['IMPLEMENTATION', 'DEPLOYMENT'], required: true, index: true },
  title: { type: String, required: true },
  description: { type: String },
  status: { type: String, enum: ['PENDING', 'IN_PROGRESS', 'DONE', 'BLOCKED'], default: 'PENDING' },
  assignee: { type: String },
  dueDate: { type: Date },
  completedAt: { type: Date },
}, { timestamps: true });

OnboardingTaskSchema.plugin(auditPlugin);

export const OnboardingTask = mongoose.model<IOnboardingTask>('OnboardingTask', OnboardingTaskSchema);

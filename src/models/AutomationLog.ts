import mongoose, { Schema, Document } from 'mongoose';
import { AutomationRuleType } from './AutomationRule';

export interface IAutomationLog extends Document {
  type: AutomationRuleType;
  message: string;
  tenantId?: mongoose.Types.ObjectId;
  leadId?: mongoose.Types.ObjectId;
  status: 'SUCCESS' | 'FAILURE';
  details?: Record<string, any>;
  createdAt: Date;
}

const AutomationLogSchema = new Schema<IAutomationLog>({
  type: { type: String, required: true, index: true },
  message: { type: String, required: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
  status: { type: String, enum: ['SUCCESS', 'FAILURE'], default: 'SUCCESS' },
  details: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const AutomationLog = mongoose.model<IAutomationLog>('AutomationLog', AutomationLogSchema);

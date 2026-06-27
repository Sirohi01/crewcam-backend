import mongoose, { Schema, Document } from 'mongoose';

export type AutomationRuleType = 'PAYMENT_REMINDER' | 'LEAD_FOLLOWUP' | 'LIFECYCLE_AUTO_ADVANCE' | 'AI_CREDITS_LOW';

export const AUTOMATION_RULE_TYPES: AutomationRuleType[] = [
  'PAYMENT_REMINDER', 'LEAD_FOLLOWUP', 'LIFECYCLE_AUTO_ADVANCE', 'AI_CREDITS_LOW',
];

export interface IAutomationRule extends Document {
  type: AutomationRuleType;
  isEnabled: boolean;
  // Days of inactivity before a payment/lead reminder repeats or fires (unused by LIFECYCLE_AUTO_ADVANCE)
  intervalDays: number;
  // Only used by AI_CREDITS_LOW
  threshold: number;
  lastRunAt?: Date;
}

const AutomationRuleSchema = new Schema<IAutomationRule>({
  type: { type: String, enum: AUTOMATION_RULE_TYPES, required: true, unique: true },
  isEnabled: { type: Boolean, default: true },
  intervalDays: { type: Number, default: 3 },
  threshold: { type: Number, default: 10 },
  lastRunAt: { type: Date },
}, { timestamps: true });

export const AutomationRule = mongoose.model<IAutomationRule>('AutomationRule', AutomationRuleSchema);

import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

const LIFECYCLE_SEQUENCE_TUPLE = [
  'LEAD', 'DEMO_SCHEDULED', 'PROPOSAL_SENT', 'QUOTATION_APPROVED',
  'SUBSCRIPTION_PENDING', 'SUBSCRIPTION_PAID', 'SETUP_FEE_PENDING', 'SETUP_FEE_PAID',
  'IMPLEMENTATION_IN_PROGRESS', 'WORKSPACE_PROVISIONING', 'CONFIGURATION', 'QA_VERIFICATION',
  'ADMIN_CREDENTIALS_GENERATED', 'ACTIVATION_PENDING', 'ACTIVE', 'LIVE',
] as const;

export const LIFECYCLE_STATUSES = [...LIFECYCLE_SEQUENCE_TUPLE, 'SUSPENDED', 'EXPIRED', 'CLOSED'] as const;

export type LifecycleStatus = typeof LIFECYCLE_STATUSES[number];

export const LIFECYCLE_SEQUENCE: readonly LifecycleStatus[] = LIFECYCLE_SEQUENCE_TUPLE;

export interface ITenant extends Document, IAuditable {
  name: string;
  isActive: boolean;
  packageId: mongoose.Types.ObjectId;
  aiCredits: number;
  preferredAiProvider?: 'OpenAI' | 'Gemini' | 'Anthropic';

  lifecycleStatus: LifecycleStatus;
  lifecycleUpdatedAt?: Date;

  setupFeeStatus: 'PENDING' | 'PAID' | 'WAIVED';
  setupFeePaidAt?: Date;
  setupFeeAmount: number;
  setupFeeCurrency: 'INR' | 'USD';

  subscriptionStatus: 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';
  subscriptionStartDate?: Date;
  nextRenewalDate?: Date;
  billingCycle: 'MONTHLY' | 'YEARLY';
  subscriptionAmount: number;
  subscriptionCurrency: 'INR' | 'USD';

  userLimit: number;
  storageLimitGB: number;
  dbType: 'SHARED' | 'DEDICATED';

  credentialsEmailStatus?: 'SENT' | 'FAILED';
  credentialsEmailSentAt?: Date;
  credentialsEmailError?: string;

  lastPaymentReminderAt?: Date;
  lastAiCreditsAlertAt?: Date;
}


const TenantSchema = new Schema<ITenant>({
  name: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  packageId: { type: Schema.Types.ObjectId, ref: 'Package' },
  aiCredits: { type: Number, default: 0 },
  preferredAiProvider: { type: String, enum: ['OpenAI', 'Gemini', 'Anthropic'] },

  lifecycleStatus: { type: String, enum: LIFECYCLE_STATUSES, default: 'LEAD', index: true },
  lifecycleUpdatedAt: { type: Date },

  setupFeeStatus: { type: String, enum: ['PENDING', 'PAID', 'WAIVED'], default: 'PENDING' },
  setupFeePaidAt: { type: Date },
  setupFeeAmount: { type: Number, default: 0 },
  setupFeeCurrency: { type: String, enum: ['INR', 'USD'], default: 'INR' },

  subscriptionStatus: { type: String, enum: ['PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELLED'], default: 'PENDING' },
  subscriptionStartDate: { type: Date },
  nextRenewalDate: { type: Date },
  billingCycle: { type: String, enum: ['MONTHLY', 'YEARLY'], default: 'MONTHLY' },
  subscriptionAmount: { type: Number, default: 0 },
  subscriptionCurrency: { type: String, enum: ['INR', 'USD'], default: 'INR' },

  userLimit: { type: Number, default: 0 },
  storageLimitGB: { type: Number, default: 5 },
  dbType: { type: String, enum: ['SHARED', 'DEDICATED'], default: 'SHARED' },

  credentialsEmailStatus: { type: String, enum: ['SENT', 'FAILED'] },
  credentialsEmailSentAt: { type: Date },
  credentialsEmailError: { type: String },

  lastPaymentReminderAt: { type: Date },
  lastAiCreditsAlertAt: { type: Date },
}, { timestamps: true });

TenantSchema.plugin(auditPlugin);

export const Tenant = mongoose.model<ITenant>('Tenant', TenantSchema);

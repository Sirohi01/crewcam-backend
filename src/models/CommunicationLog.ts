import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ICommunicationLog extends Document {
  tenantId: Types.ObjectId;
  senderId: Types.ObjectId;
  recipientIds: Types.ObjectId[];
  type: 'Email' | 'SMS' | 'WhatsApp';
  subject?: string;
  messageBody: string;
  status: 'Sent' | 'Failed' | 'Pending';
  providerResponse?: string;
}

const communicationLogSchema = new Schema<ICommunicationLog>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  recipientIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  type: { type: String, enum: ['Email', 'SMS', 'WhatsApp'], required: true },
  subject: { type: String },
  messageBody: { type: String, required: true },
  status: { type: String, enum: ['Sent', 'Failed', 'Pending'], default: 'Pending' },
  providerResponse: { type: String }
}, {
  timestamps: true
});

import { tenantPlugin } from './plugins/tenantPlugin';
communicationLogSchema.plugin(tenantPlugin);

export const CommunicationLog = mongoose.model<ICommunicationLog>('CommunicationLog', communicationLogSchema);

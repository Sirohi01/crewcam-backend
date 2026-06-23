import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAgreement extends Document {
  tenantId: Types.ObjectId;
  title: string;
  type: 'MOU' | 'JV' | 'Rent' | 'Company' | 'Other';
  partiesInvolved: string[];
  startDate: Date;
  endDate?: Date;
  status: 'Active' | 'Expired' | 'Terminated' | 'Draft';
  documentUrl?: string;
}

const agreementSchema = new Schema<IAgreement>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  title: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['MOU', 'JV', 'Rent', 'Company', 'Other'], 
    required: true 
  },
  partiesInvolved: [{ type: String }],
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  status: { 
    type: String, 
    enum: ['Active', 'Expired', 'Terminated', 'Draft'], 
    default: 'Draft' 
  },
  documentUrl: { type: String }
}, {
  timestamps: true
});

import { tenantPlugin } from './plugins/tenantPlugin';
agreementSchema.plugin(tenantPlugin);

export const Agreement = mongoose.model<IAgreement>('Agreement', agreementSchema);

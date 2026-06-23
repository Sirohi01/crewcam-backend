import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDisciplinaryAction extends Document {
  tenantId: Types.ObjectId;
  employeeId: Types.ObjectId;
  type: 'Warning' | 'Suspension' | 'Demotion' | 'Termination' | 'Legal Action';
  reason: string;
  date: Date;
  issuedBy: Types.ObjectId;
  status: 'Draft' | 'Issued' | 'Appealed' | 'Resolved';
  attachments?: string[];
}

const disciplinaryActionSchema = new Schema<IDisciplinaryAction>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['Warning', 'Suspension', 'Demotion', 'Termination', 'Legal Action'], required: true },
  reason: { type: String, required: true },
  date: { type: Date, required: true },
  issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['Draft', 'Issued', 'Appealed', 'Resolved'], default: 'Draft' },
  attachments: [{ type: String }]
}, {
  timestamps: true
});

import { tenantPlugin } from './plugins/tenantPlugin';
disciplinaryActionSchema.plugin(tenantPlugin);

export const DisciplinaryAction = mongoose.model<IDisciplinaryAction>('DisciplinaryAction', disciplinaryActionSchema);

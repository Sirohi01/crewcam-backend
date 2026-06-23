import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IComplianceRecord extends Document {
  tenantId: Types.ObjectId;
  employeeId: Types.ObjectId;
  type: 'PF' | 'ESI' | 'TDS' | 'Gratuity' | 'Salary Deduction';
  amount: number;
  month: number;
  year: number;
  status: 'Pending' | 'Processed' | 'Paid';
  remarks?: string;
}

const complianceRecordSchema = new Schema<IComplianceRecord>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['PF', 'ESI', 'TDS', 'Gratuity', 'Salary Deduction'], required: true },
  amount: { type: Number, required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true },
  status: { type: String, enum: ['Pending', 'Processed', 'Paid'], default: 'Pending' },
  remarks: { type: String }
}, {
  timestamps: true
});

import { tenantPlugin } from './plugins/tenantPlugin';
complianceRecordSchema.plugin(tenantPlugin);

export const ComplianceRecord = mongoose.model<IComplianceRecord>('ComplianceRecord', complianceRecordSchema);

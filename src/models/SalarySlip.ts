import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISalarySlip extends Document {
  tenantId: Types.ObjectId;
  employeeId: Types.ObjectId;
  month: number;
  year: number;
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  status: 'Draft' | 'Generated' | 'Paid';
  breakdown: {
    earnings: {
      basic: number;
      hra: number;
      conveyance: number;
      specialAllowance: number;
    };
    deductions: {
      pf: number;
      esi: number;
      tax: number;
      other: number;
    };
  };
}

const salarySlipSchema = new Schema<ISalarySlip>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true },
  totalEarnings: { type: Number, required: true },
  totalDeductions: { type: Number, required: true },
  netPay: { type: Number, required: true },
  status: { type: String, enum: ['Draft', 'Generated', 'Paid'], default: 'Draft' },
  breakdown: {
    earnings: {
      basic: { type: Number, default: 0 },
      hra: { type: Number, default: 0 },
      conveyance: { type: Number, default: 0 },
      specialAllowance: { type: Number, default: 0 }
    },
    deductions: {
      pf: { type: Number, default: 0 },
      esi: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      other: { type: Number, default: 0 }
    }
  }
}, {
  timestamps: true
});

// Ensure only one slip per employee per month
salarySlipSchema.index({ tenantId: 1, employeeId: 1, month: 1, year: 1 }, { unique: true });

import { tenantPlugin } from './plugins/tenantPlugin';
salarySlipSchema.plugin(tenantPlugin);

export const SalarySlip = mongoose.model<ISalarySlip>('SalarySlip', salarySlipSchema);

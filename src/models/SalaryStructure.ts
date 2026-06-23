import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISalaryStructure extends Document {
  tenantId: Types.ObjectId;
  employeeId: Types.ObjectId;
  basic: number;
  hra: number;
  conveyance: number;
  specialAllowance: number;
  pfDeduction: number;
  esiDeduction: number;
  taxDeduction: number;
}

const salaryStructureSchema = new Schema<ISalaryStructure>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  basic: { type: Number, default: 0 },
  hra: { type: Number, default: 0 },
  conveyance: { type: Number, default: 0 },
  specialAllowance: { type: Number, default: 0 },
  pfDeduction: { type: Number, default: 0 },
  esiDeduction: { type: Number, default: 0 },
  taxDeduction: { type: Number, default: 0 }
}, {
  timestamps: true
});

import { tenantPlugin } from './plugins/tenantPlugin';
salaryStructureSchema.plugin(tenantPlugin);

export const SalaryStructure = mongoose.model<ISalaryStructure>('SalaryStructure', salaryStructureSchema);

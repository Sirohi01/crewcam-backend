import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IKRA extends Document {
  tenantId: Types.ObjectId;
  employeeId: Types.ObjectId;
  title: string;
  description?: string;
  weightage: number; // e.g. 20 for 20%
  status: 'Active' | 'Completed' | 'Archived';
  kpis: {
    title: string;
    target: number;
    achieved: number;
    unit: string;
  }[];
}

const kraSchema = new Schema<IKRA>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String },
  weightage: { type: Number, required: true, min: 1, max: 100 },
  status: { type: String, enum: ['Active', 'Completed', 'Archived'], default: 'Active' },
  kpis: [{
    title: { type: String, required: true },
    target: { type: Number, required: true },
    achieved: { type: Number, default: 0 },
    unit: { type: String, required: true }
  }]
}, {
  timestamps: true
});

import { tenantPlugin } from './plugins/tenantPlugin';
kraSchema.plugin(tenantPlugin);

export const KRA = mongoose.model<IKRA>('KRA', kraSchema);

import mongoose, { Document, Schema } from 'mongoose';

export interface ICostCenter extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  code: string;
  head: mongoose.Types.ObjectId | null;
  status: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CostCenterSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    head: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, required: true, enum: ['Active', 'Inactive'], default: 'Active' },
    description: { type: String },
  },
  { timestamps: true }
);

CostCenterSchema.index({ tenantId: 1, code: 1 }, { unique: true });

export default mongoose.model<ICostCenter>('CostCenter', CostCenterSchema);

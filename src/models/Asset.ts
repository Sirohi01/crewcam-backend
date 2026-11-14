import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';
import { auditPlugin } from './plugins/auditPlugin';

export interface IAsset extends Document {
  tenantId: Types.ObjectId;
  name: string;
  type: string;
  serialNumber: string;
  purchaseDate?: Date;
  purchaseValue?: number; // ₹, optional — shown to the employee as the asset's value
  status: 'Available' | 'Allocated' | 'Maintenance' | 'Retired';
}

const assetSchema = new Schema<IAsset>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, required: true },
  serialNumber: { type: String, required: true, unique: true },
  purchaseDate: { type: Date },
  purchaseValue: { type: Number, min: 0 },
  status: {
    type: String,
    enum: ['Available', 'Allocated', 'Maintenance', 'Retired'],
    default: 'Available'
  }
}, {
  timestamps: true
});

assetSchema.plugin(tenantPlugin);
assetSchema.plugin(auditPlugin);

export const Asset = mongoose.model<IAsset>('Asset', assetSchema);

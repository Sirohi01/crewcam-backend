import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';
import { auditPlugin } from './plugins/auditPlugin';

export interface IAssetAllocation extends Document {
  tenantId: Types.ObjectId;
  assetId: Types.ObjectId;
  employeeId: Types.ObjectId;
  allocatedDate: Date;
  returnDate?: Date;
  condition?: string;
  status: 'Active' | 'Returned';
}

const assetAllocationSchema = new Schema<IAssetAllocation>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  assetId: { type: Schema.Types.ObjectId, ref: 'Asset', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  allocatedDate: { type: Date, required: true, default: Date.now },
  returnDate: { type: Date },
  condition: { type: String },
  status: { 
    type: String, 
    enum: ['Active', 'Returned'], 
    default: 'Active' 
  }
}, {
  timestamps: true
});

assetAllocationSchema.plugin(tenantPlugin);
assetAllocationSchema.plugin(auditPlugin);

export const AssetAllocation = mongoose.model<IAssetAllocation>('AssetAllocation', assetAllocationSchema);

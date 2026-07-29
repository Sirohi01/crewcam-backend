import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';
import { auditPlugin } from './plugins/auditPlugin';

export interface IAssetAllocation extends Document {
  candidateName?: string;
  department?: string;
  designation?: string;
  uniqueId?: string;
  personalEmail?: string;
  officialEmail?: string;
  mobileNumber?: string;
  system_other?: string;
  sharedFolder_other?: string;
  restrictedRolesDetailed?: string;
  deviceType?: string;
  serialNo?: string;
  modelNo?: string;
  softwareInstalled?: string;
  processedBy?: string;
  accessCreatedOn?: string;
  itRemarks?: string;

  tenantId: Types.ObjectId;
  assetId: Types.ObjectId;
  employeeId: Types.ObjectId;
  allocatedDate: Date;
  returnDate?: Date;
  condition?: string;
  status: 'Active' | 'Returned';
}

const assetAllocationSchema = new Schema<IAssetAllocation>({
  candidateName: { type: String },
  department: { type: String },
  designation: { type: String },
  uniqueId: { type: String },
  personalEmail: { type: String },
  officialEmail: { type: String },
  mobileNumber: { type: String },
  system_other: { type: String },
  sharedFolder_other: { type: String },
  restrictedRolesDetailed: { type: String },
  deviceType: { type: String },
  serialNo: { type: String },
  modelNo: { type: String },
  softwareInstalled: { type: String },
  processedBy: { type: String },
  accessCreatedOn: { type: String },
  itRemarks: { type: String },

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

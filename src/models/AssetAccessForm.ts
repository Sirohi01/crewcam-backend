import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IAssetAccessForm extends ITenantScoped {
  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  assetsIssued: {
    assetType: string;
    assetTag?: string;
    serialNumber?: string;
    issuedDate?: Date;
    condition?: string;
  }[];
  accessGranted: {
    systemName: string;
    accessLevel?: string;
    grantedDate?: Date;
  }[];
  stationeryIssued: {
    item: string;
    quantity: number;
  }[];
  issuedBy: Types.ObjectId;
  status: 'Pending' | 'Issued' | 'Returned';
}

const assetAccessFormSchema = new Schema<IAssetAccessForm>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  assetsIssued: [{
    assetType: { type: String, required: true },
    assetTag: { type: String },
    serialNumber: { type: String },
    issuedDate: { type: Date },
    condition: { type: String }
  }],
  accessGranted: [{
    systemName: { type: String, required: true },
    accessLevel: { type: String },
    grantedDate: { type: Date }
  }],
  stationeryIssued: [{
    item: { type: String, required: true },
    quantity: { type: Number, default: 1 }
  }],
  issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['Pending', 'Issued', 'Returned'], default: 'Pending' }
}, { timestamps: true });

assetAccessFormSchema.plugin(tenantPlugin);

export const AssetAccessForm = mongoose.model<IAssetAccessForm>('AssetAccessForm', assetAccessFormSchema);

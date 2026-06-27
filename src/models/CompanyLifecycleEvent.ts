import mongoose, { Schema, Document } from 'mongoose';
import { LifecycleStatus, LIFECYCLE_STATUSES } from './Tenant';

export interface ICompanyLifecycleEvent extends Document {
  tenantId: mongoose.Types.ObjectId;
  fromStatus?: LifecycleStatus;
  toStatus: LifecycleStatus;
  note?: string;
  changedBy?: mongoose.Types.ObjectId;
}

const CompanyLifecycleEventSchema = new Schema<ICompanyLifecycleEvent>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  fromStatus: { type: String, enum: LIFECYCLE_STATUSES },
  toStatus: { type: String, enum: LIFECYCLE_STATUSES, required: true },
  note: { type: String },
  changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const CompanyLifecycleEvent = mongoose.model<ICompanyLifecycleEvent>('CompanyLifecycleEvent', CompanyLifecycleEventSchema);

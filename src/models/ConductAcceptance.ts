import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IConductAcceptance extends ITenantScoped {
  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  version?: string;
  status: 'Pending' | 'Accepted';
  acceptedAt?: Date;
  ipAddress?: string;
}

const conductAcceptanceSchema = new Schema<IConductAcceptance>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  version: { type: String },
  status: { type: String, enum: ['Pending', 'Accepted'], default: 'Pending' },
  acceptedAt: { type: Date },
  ipAddress: { type: String }
}, { timestamps: true });

conductAcceptanceSchema.plugin(tenantPlugin);

export const ConductAcceptance = mongoose.model<IConductAcceptance>('ConductAcceptance', conductAcceptanceSchema);

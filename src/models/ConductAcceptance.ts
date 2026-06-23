import mongoose, { Schema, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IConductAcceptance extends ITenantScoped {
  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  version?: string;
  conductTitle?: string;
  // Content snapshot (frozen at time of signing)
  conductContentSnapshot?: string;
  signerName?: string;
  signerDesignation?: string;
  // Acknowledgement checkboxes
  hasRead?: boolean;
  understands?: boolean;             // shared with IT policy page
  agreesToComply?: boolean;          // shared with IT policy page
  understandsConsequences?: boolean;
  agreesToAbide?: boolean;
  // Metadata
  status: 'Pending' | 'Accepted';
  acceptedAt?: Date;
  ipAddress?: string;
  userAgent?: string;
  pdfUrl?: string;
}

const conductAcceptanceSchema = new Schema<IConductAcceptance>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  version: { type: String },
  conductTitle: { type: String },
  conductContentSnapshot: { type: String },
  signerName: { type: String },
  signerDesignation: { type: String },
  hasRead: { type: Boolean, default: false },
  understands: { type: Boolean, default: false },
  agreesToComply: { type: Boolean, default: false },
  understandsConsequences: { type: Boolean, default: false },
  agreesToAbide: { type: Boolean, default: false },
  status: { type: String, enum: ['Pending', 'Accepted'], default: 'Pending' },
  acceptedAt: { type: Date },
  ipAddress: { type: String },
  userAgent: { type: String },
  pdfUrl: { type: String },
}, { timestamps: true });

conductAcceptanceSchema.plugin(tenantPlugin);

export const ConductAcceptance = mongoose.model<IConductAcceptance>('ConductAcceptance', conductAcceptanceSchema);

import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IEngagementConfirmation extends ITenantScoped {
  employeeName?: string;
  uniqueId?: string;
  department?: string;
  designation?: string;
  joiningDate?: string;
  officialMobileNo?: string;
  reportingTo?: string;
  signatureDate?: string;
  hrName?: string;
  hrVerificationDate?: string;

  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  engagementType: 'Full-time' | 'Contract' | 'Consultant';
  confirmedDate?: Date;
  sentBy: Types.ObjectId;
  status: 'Pending' | 'Sent' | 'Confirmed';
}

const engagementConfirmationSchema = new Schema<IEngagementConfirmation>({
  employeeName: { type: String },
  uniqueId: { type: String },
  department: { type: String },
  designation: { type: String },
  joiningDate: { type: String },
  officialMobileNo: { type: String },
  reportingTo: { type: String },
  signatureDate: { type: String },
  hrName: { type: String },
  hrVerificationDate: { type: String },

  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  engagementType: { type: String, enum: ['Full-time', 'Contract', 'Consultant'], default: 'Full-time' },
  confirmedDate: { type: Date },
  sentBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['Pending', 'Sent', 'Confirmed'], default: 'Pending' }
}, { timestamps: true });

engagementConfirmationSchema.plugin(tenantPlugin);

export const EngagementConfirmation = mongoose.model<IEngagementConfirmation>('EngagementConfirmation', engagementConfirmationSchema);

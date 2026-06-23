import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IEngagementConfirmation extends ITenantScoped {
  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  engagementType: 'Full-time' | 'Contract' | 'Consultant';
  confirmedDate?: Date;
  sentBy: Types.ObjectId;
  status: 'Pending' | 'Sent' | 'Confirmed';
}

const engagementConfirmationSchema = new Schema<IEngagementConfirmation>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  engagementType: { type: String, enum: ['Full-time', 'Contract', 'Consultant'], default: 'Full-time' },
  confirmedDate: { type: Date },
  sentBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['Pending', 'Sent', 'Confirmed'], default: 'Pending' }
}, { timestamps: true });

engagementConfirmationSchema.plugin(tenantPlugin);

export const EngagementConfirmation = mongoose.model<IEngagementConfirmation>('EngagementConfirmation', engagementConfirmationSchema);

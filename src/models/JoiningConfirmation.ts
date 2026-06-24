import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IJoiningConfirmation extends ITenantScoped {
  candidateId: Types.ObjectId;
  confirmedJoiningDate: Date;
  reportingManagerId?: Types.ObjectId;
  reportingManagerName?: string;
  reportingTime?: string;
  reportingLocation?: string;
  emailSentTo?: string;
  emailSentAt?: Date;
  status: 'Pending' | 'Sent' | 'Confirmed';
  confirmedByCandidate: boolean;
  sentBy: Types.ObjectId;
}

const joiningConfirmationSchema = new Schema<IJoiningConfirmation>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  confirmedJoiningDate: { type: Date, required: true },
  reportingManagerId: { type: Schema.Types.ObjectId, ref: 'User' },
  reportingManagerName: { type: String },
  reportingTime: { type: String },
  reportingLocation: { type: String },
  emailSentTo: { type: String },
  emailSentAt: { type: Date },
  status: { type: String, enum: ['Pending', 'Sent', 'Confirmed'], default: 'Pending' },
  confirmedByCandidate: { type: Boolean, default: false },
  sentBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

joiningConfirmationSchema.plugin(tenantPlugin);

export const JoiningConfirmation = mongoose.model<IJoiningConfirmation>('JoiningConfirmation', joiningConfirmationSchema);

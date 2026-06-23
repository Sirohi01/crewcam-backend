import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface ILetterOfIntent extends ITenantScoped {
  candidateId: Types.ObjectId;
  designation: string;
  departmentId?: Types.ObjectId;
  proposedCTC?: number;
  joiningDate?: Date;
  validUntil?: Date;
  letterContent?: string;
  pdfUrl?: string;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Expired';
  issuedBy: Types.ObjectId;
  sentDate?: Date;
  respondedDate?: Date;
}

const letterOfIntentSchema = new Schema<ILetterOfIntent>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  designation: { type: String, required: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
  proposedCTC: { type: Number },
  joiningDate: { type: Date },
  validUntil: { type: Date },
  letterContent: { type: String },
  pdfUrl: { type: String },
  status: { type: String, enum: ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired'], default: 'Draft' },
  issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sentDate: { type: Date },
  respondedDate: { type: Date }
}, { timestamps: true });

letterOfIntentSchema.plugin(tenantPlugin);

export const LetterOfIntent = mongoose.model<ILetterOfIntent>('LetterOfIntent', letterOfIntentSchema);

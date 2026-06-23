import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IOfferLetter extends ITenantScoped {
  candidateId: Types.ObjectId;
  ctcBreakupId?: Types.ObjectId;
  designation: string;
  departmentId?: Types.ObjectId;
  joiningDate?: Date;
  validUntil?: Date;
  offerContent?: string;
  pdfUrl?: string;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Withdrawn' | 'Expired';
  issuedBy: Types.ObjectId;
  sentDate?: Date;
  respondedDate?: Date;
}

const offerLetterSchema = new Schema<IOfferLetter>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  ctcBreakupId: { type: Schema.Types.ObjectId, ref: 'CTCBreakup' },
  designation: { type: String, required: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
  joiningDate: { type: Date },
  validUntil: { type: Date },
  offerContent: { type: String },
  pdfUrl: { type: String },
  status: { type: String, enum: ['Draft', 'Sent', 'Accepted', 'Declined', 'Withdrawn', 'Expired'], default: 'Draft' },
  issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sentDate: { type: Date },
  respondedDate: { type: Date }
}, { timestamps: true });

offerLetterSchema.plugin(tenantPlugin);

export const OfferLetter = mongoose.model<IOfferLetter>('OfferLetter', offerLetterSchema);

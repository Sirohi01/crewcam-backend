import mongoose, { Schema, Document } from 'mongoose';

export interface ILeadProposalItem {
  description: string;
  amount: number;
}

export interface ILeadProposal extends Document {
  leadId: mongoose.Types.ObjectId;
  proposalNumber: string;
  items: ILeadProposalItem[];
  totalAmount: number;
  currency: 'INR' | 'USD';
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'EXPIRED';
  validUntil?: Date;
  pdfUrl?: string;
  sentAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
}

const LeadProposalSchema = new Schema<ILeadProposal>({
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  proposalNumber: { type: String, required: true, unique: true },
  items: [{
    description: { type: String, required: true },
    amount: { type: Number, required: true },
  }],
  totalAmount: { type: Number, required: true },
  currency: { type: String, enum: ['INR', 'USD'], default: 'INR' },
  status: { type: String, enum: ['DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED'], default: 'DRAFT' },
  validUntil: { type: Date },
  pdfUrl: { type: String },
  sentAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const LeadProposal = mongoose.model<ILeadProposal>('LeadProposal', LeadProposalSchema);

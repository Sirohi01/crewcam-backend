import mongoose, { Schema, Document } from 'mongoose';

export interface IQuotationItem {
  description: string;
  amount: number;
}

export interface IQuotation extends Document {
  tenantId: mongoose.Types.ObjectId;
  quotationNumber: string;
  items: IQuotationItem[];
  totalAmount: number;
  currency: 'INR' | 'USD';
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'EXPIRED';
  validUntil?: Date;
  pdfUrl?: string;
  sentAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
}

const QuotationSchema = new Schema<IQuotation>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  quotationNumber: { type: String, required: true, unique: true },
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

export const Quotation = mongoose.model<IQuotation>('Quotation', QuotationSchema);

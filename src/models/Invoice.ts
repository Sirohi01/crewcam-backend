import mongoose, { Schema, Document } from 'mongoose';

export const INVOICE_STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'REFUNDED', 'CANCELLED'] as const;
export type InvoiceStatus = typeof INVOICE_STATUSES[number];

export interface IInvoice extends Document {
  tenantId: mongoose.Types.ObjectId;
  invoiceNumber: string;
  type: 'SETUP_FEE' | 'SUBSCRIPTION';
  // amount = subtotal before discount/tax. totalAmount = what is actually owed/collected.
  amount: number;
  couponCode?: string;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  currency: 'INR' | 'USD';
  status: InvoiceStatus;
  dueDate?: Date;
  paidAt?: Date;
  pdfUrl?: string;
  gateway?: 'RAZORPAY' | 'STRIPE' | 'MANUAL';
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  createdBy?: mongoose.Types.ObjectId;
}

const InvoiceSchema = new Schema<IInvoice>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  invoiceNumber: { type: String, required: true, unique: true },
  type: { type: String, enum: ['SETUP_FEE', 'SUBSCRIPTION'], required: true },
  amount: { type: Number, required: true },
  couponCode: { type: String },
  discountAmount: { type: Number, default: 0 },
  // Simplified single GST line (default 18% for India) — not a CGST/SGST/IGST e-invoicing split.
  taxRate: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  amountPaid: { type: Number, default: 0 },
  currency: { type: String, enum: ['INR', 'USD'], default: 'INR' },
  status: { type: String, enum: INVOICE_STATUSES, default: 'PENDING', index: true },
  dueDate: { type: Date },
  paidAt: { type: Date },
  pdfUrl: { type: String },
  gateway: { type: String, enum: ['RAZORPAY', 'STRIPE', 'MANUAL'] },
  gatewayOrderId: { type: String, index: true },
  gatewayPaymentId: { type: String },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const Invoice = mongoose.model<IInvoice>('Invoice', InvoiceSchema);

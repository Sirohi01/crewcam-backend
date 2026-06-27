import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
  tenantId: mongoose.Types.ObjectId;
  invoiceId?: mongoose.Types.ObjectId;
  type: 'SETUP_FEE' | 'SUBSCRIPTION' | 'AI_CREDIT_TOPUP';
  amount: number;
  currency: 'INR' | 'USD';
  paidAt: Date;
  recordedBy?: mongoose.Types.ObjectId;
  notes?: string;
  gateway: 'RAZORPAY' | 'STRIPE' | 'MANUAL';
  gatewayPaymentId?: string;
}

const PaymentSchema = new Schema<IPayment>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', index: true },
  type: { type: String, enum: ['SETUP_FEE', 'SUBSCRIPTION', 'AI_CREDIT_TOPUP'], required: true },
  amount: { type: Number, required: true },
  currency: { type: String, enum: ['INR', 'USD'], default: 'INR' },
  paidAt: { type: Date, required: true, default: Date.now, index: true },
  recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String },
  gateway: { type: String, enum: ['RAZORPAY', 'STRIPE', 'MANUAL'], default: 'MANUAL' },
  gatewayPaymentId: { type: String },
}, { timestamps: true });

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);

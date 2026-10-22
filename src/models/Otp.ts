import mongoose, { Document, Schema } from 'mongoose';

export interface IOtp extends Document {
  phone: string;
  otp: string;
  tenantId?: mongoose.Types.ObjectId;
  expiresAt: Date;
}

const otpSchema = new Schema<IOtp>(
  {
    phone: { type: String, required: true },
    otp: { type: String, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    expiresAt: { type: Date, required: true, index: { expires: '5m' } } // Auto delete after 5 minutes
  },
  { timestamps: true }
);

export const Otp = mongoose.model<IOtp>('Otp', otpSchema);

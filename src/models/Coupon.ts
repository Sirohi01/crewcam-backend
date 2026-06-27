import mongoose, { Schema, Document } from 'mongoose';

export interface ICoupon extends Document {
  code: string;
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
  appliesTo: 'SETUP_FEE' | 'SUBSCRIPTION' | 'BOTH';
  maxRedemptions?: number;
  redeemedCount: number;
  validFrom?: Date;
  validUntil?: Date;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
}

const CouponSchema = new Schema<ICoupon>({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  type: { type: String, enum: ['PERCENTAGE', 'FIXED'], required: true },
  value: { type: Number, required: true },
  appliesTo: { type: String, enum: ['SETUP_FEE', 'SUBSCRIPTION', 'BOTH'], default: 'BOTH' },
  maxRedemptions: { type: Number },
  redeemedCount: { type: Number, default: 0 },
  validFrom: { type: Date },
  validUntil: { type: Date },
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const Coupon = mongoose.model<ICoupon>('Coupon', CouponSchema);

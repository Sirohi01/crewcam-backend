import mongoose, { Schema, Document } from 'mongoose';

export type LeadMasterDataType = 'SOURCE' | 'LOST_REASON';

export interface ILeadMasterData extends Document {
  type: LeadMasterDataType;
  value: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LeadMasterDataSchema = new Schema<ILeadMasterData>({
  type: { type: String, enum: ['SOURCE', 'LOST_REASON'], required: true, index: true },
  value: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

LeadMasterDataSchema.index({ type: 1, value: 1 }, { unique: true });

export const LeadMasterData = mongoose.model<ILeadMasterData>('LeadMasterData', LeadMasterDataSchema);

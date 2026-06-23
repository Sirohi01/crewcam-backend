import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

export interface IOutInRecord extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  type: 'Out' | 'In';
  reason: string;
  timestamp: Date;
}

const outInRecordSchema = new Schema<IOutInRecord>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['Out', 'In'], required: true },
  reason: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

outInRecordSchema.plugin(tenantPlugin);

export const OutInRecord = mongoose.model<IOutInRecord>('OutInRecord', outInRecordSchema);

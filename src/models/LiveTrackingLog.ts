import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const RETENTION_SECONDS = 30 * 24 * 60 * 60; // 30 days — do not keep location history indefinitely.

export interface ILiveTrackingLog extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  lat: number;
  lng: number;
  recordedAt: Date;
}

const liveTrackingLogSchema = new Schema<ILiveTrackingLog>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  recordedAt: { type: Date, default: Date.now },
}, { timestamps: true });

liveTrackingLogSchema.index({ recordedAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });
liveTrackingLogSchema.plugin(tenantPlugin);

export const LiveTrackingLog = mongoose.model<ILiveTrackingLog>('LiveTrackingLog', liveTrackingLogSchema);

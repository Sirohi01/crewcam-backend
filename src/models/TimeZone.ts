import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface ITimeZone extends IAuditable {
  name: string;
  identifier: string; // e.g. Asia/Kolkata
  offset: string; // e.g. UTC +05:30
  description?: string;
  isActive: boolean;
}

const timeZoneSchema = new Schema<ITimeZone>({
  name: { type: String, required: true, trim: true },
  identifier: { type: String, required: true, trim: true },
  offset: { type: String, required: true, trim: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

timeZoneSchema.plugin(auditPlugin);

export const TimeZone = mongoose.models.TimeZone as Model<ITimeZone> || mongoose.model<ITimeZone>('TimeZone', timeZoneSchema);

import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from '../plugins/auditPlugin';

export interface IWeekStartsOn extends IAuditable {
  name: string;
  code: string;
  description: string;
  isActive: boolean;
}

const schema = new Schema<IWeekStartsOn>({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

schema.plugin(auditPlugin);

export const WeekStartsOn = mongoose.models.WeekStartsOn as Model<IWeekStartsOn> || mongoose.model<IWeekStartsOn>('WeekStartsOn', schema);

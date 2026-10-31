import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from '../plugins/auditPlugin';

export interface IPreferredLanguage extends IAuditable {
  name: string;
  code: string;
  description: string;
  isActive: boolean;
}

const schema = new Schema<IPreferredLanguage>({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

schema.plugin(auditPlugin);

export const PreferredLanguage = mongoose.models.PreferredLanguage as Model<IPreferredLanguage> || mongoose.model<IPreferredLanguage>('PreferredLanguage', schema);

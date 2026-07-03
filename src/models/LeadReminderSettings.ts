import mongoose, { Schema, Document } from 'mongoose';

export interface ILeadReminderSettings extends Document {
  userId: mongoose.Types.ObjectId;
  enabled: boolean;
  remindBeforeMinutes: number;
  notifyByEmail: boolean;
  notifyByWhatsApp: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LeadReminderSettingsSchema = new Schema<ILeadReminderSettings>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  enabled: { type: Boolean, default: true },
  remindBeforeMinutes: { type: Number, default: 60 },
  notifyByEmail: { type: Boolean, default: true },
  notifyByWhatsApp: { type: Boolean, default: true },
}, { timestamps: true });

export const LeadReminderSettings = mongoose.model<ILeadReminderSettings>('LeadReminderSettings', LeadReminderSettingsSchema);

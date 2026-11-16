import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

/**
 * Company safety information shown on the employee Emergency page (Phase 1D-3b):
 * helplines, office safety details, tips, guide/map documents, and whether a triggered
 * alert also texts the employee's emergency contacts. One document per company.
 */
export interface IHelpline {
  label: string;
  number: string;
  available24x7: boolean;
}

export interface IEmergencySettings extends Document {
  tenantId: Types.ObjectId;
  helplines: IHelpline[];
  officeAddress?: string; // falls back to the company address
  nearestHospital?: string;
  assemblyPoint?: string;
  aedLocation?: string;
  emergencyExits?: string;
  safetyTips: string[];
  guideUrl?: string;
  safetyMapUrl?: string;
  smsEmergencyContacts: boolean;
  updatedBy?: Types.ObjectId;
}

const helplineSchema = new Schema<IHelpline>({
  label: { type: String, required: true, trim: true, maxlength: 60 },
  number: { type: String, required: true, trim: true, maxlength: 20 },
  available24x7: { type: Boolean, default: true },
}, { _id: false });

const emergencySettingsSchema = new Schema<IEmergencySettings>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
  helplines: { type: [helplineSchema], default: [] },
  officeAddress: { type: String, maxlength: 300 },
  nearestHospital: { type: String, maxlength: 300 },
  assemblyPoint: { type: String, maxlength: 300 },
  aedLocation: { type: String, maxlength: 300 },
  emergencyExits: { type: String, maxlength: 300 },
  safetyTips: { type: [String], default: [] },
  guideUrl: { type: String },
  safetyMapUrl: { type: String },
  smsEmergencyContacts: { type: Boolean, default: false },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

emergencySettingsSchema.plugin(tenantPlugin);

export const EmergencySettings = mongoose.model<IEmergencySettings>('EmergencySettings', emergencySettingsSchema);

import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IEmergencyContactEntry {
  name: string;
  relationship: string;
  phone: string;
  alternatePhone?: string;
  address?: string;
}

export interface IEmergencyContact extends ITenantScoped {
  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  contacts: IEmergencyContactEntry[];
}

const emergencyContactSchema = new Schema<IEmergencyContact>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  contacts: [{
    name: { type: String, required: true },
    relationship: { type: String, required: true },
    phone: { type: String, required: true },
    alternatePhone: { type: String },
    address: { type: String }
  }]
}, { timestamps: true });

emergencyContactSchema.plugin(tenantPlugin);

export const EmergencyContact = mongoose.model<IEmergencyContact>('EmergencyContact', emergencyContactSchema);

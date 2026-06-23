import mongoose, { Schema, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IEmergencyContactEntry {
  isPrimary: boolean;
  name: string;
  relationship: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  address?: string;
}

export interface IMedicalInfo {
  bloodGroup?: string;
  knownAllergies?: string;
  chronicConditions?: string;
  currentMedications?: string;
  doctorName?: string;
  doctorPhone?: string;
  hospitalPreference?: string;
  insurancePolicyNumber?: string;
}

export interface IEmergencyContact extends ITenantScoped {
  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  contacts: IEmergencyContactEntry[];
  medicalInfo?: IMedicalInfo;
  documents: {
    name: string;
    status: 'Pending' | 'Submitted' | 'Verified';
  }[];
  hrVerifiedBy?: string;
  hrVerifiedDate?: Date;
  hrRemarks?: string;
  status: 'Pending' | 'Submitted' | 'Verified';
}

const emergencyContactSchema = new Schema<IEmergencyContact>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },

  contacts: [{
    isPrimary: { type: Boolean, default: false },
    name: { type: String, required: true },
    relationship: { type: String, required: true },
    phone: { type: String, required: true },
    alternatePhone: { type: String },
    email: { type: String },
    address: { type: String },
  }],

  medicalInfo: {
    bloodGroup: { type: String },
    knownAllergies: { type: String },
    chronicConditions: { type: String },
    currentMedications: { type: String },
    doctorName: { type: String },
    doctorPhone: { type: String },
    hospitalPreference: { type: String },
    insurancePolicyNumber: { type: String },
  },

  documents: [{
    name: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Submitted', 'Verified'], default: 'Pending' },
  }],

  hrVerifiedBy: { type: String },
  hrVerifiedDate: { type: Date },
  hrRemarks: { type: String },

  status: { type: String, enum: ['Pending', 'Submitted', 'Verified'], default: 'Pending' },
}, { timestamps: true });

emergencyContactSchema.plugin(tenantPlugin);

export const EmergencyContact = mongoose.model<IEmergencyContact>('EmergencyContact', emergencyContactSchema);

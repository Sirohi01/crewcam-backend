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
  employeeName?: string;
  empCode?: string;
  designation?: string;
  department?: string;
  dateOfJoining?: string;
  workLocation?: string;
  reportingTo?: string;
  primaryName?: string;
  primaryRelation?: string;
  primaryMobile?: string;
  primaryAlternateNo?: string;
  primaryAddress?: string;
  secondaryName?: string;
  secondaryRelation?: string;
  secondaryMobile?: string;
  secondaryAlternateNo?: string;
  secondaryAddress?: string;
  knownMedicalConditions?: string;
  allergies?: string;
  regularMedication?: string;
  verifiedBy?: string;
  verificationDate?: string;

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
  employeeName: { type: String },
  empCode: { type: String },
  designation: { type: String },
  department: { type: String },
  dateOfJoining: { type: String },
  workLocation: { type: String },
  reportingTo: { type: String },
  primaryName: { type: String },
  primaryRelation: { type: String },
  primaryMobile: { type: String },
  primaryAlternateNo: { type: String },
  primaryAddress: { type: String },
  secondaryName: { type: String },
  secondaryRelation: { type: String },
  secondaryMobile: { type: String },
  secondaryAlternateNo: { type: String },
  secondaryAddress: { type: String },
  knownMedicalConditions: { type: String },
  allergies: { type: String },
  regularMedication: { type: String },
  verifiedBy: { type: String },
  verificationDate: { type: String },

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

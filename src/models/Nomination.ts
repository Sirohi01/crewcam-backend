import mongoose, { Schema, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface INominee {
  name: string;
  relationship: string;
  dob?: Date;
  age?: number;
  sharePercentage: number;
  address?: string;
  isMinor: boolean;
  guardianName?: string;
  guardianRelationship?: string;
  guardianAddress?: string;
}

export interface INomination extends ITenantScoped {
  employeeName?: string;
  empCode?: string;
  designation?: string;
  department?: string;
  fatherHusbandSpouse?: string;
  gender?: string;
  dateOfJoining?: string;
  mobileNumber?: string;
  emailId?: string;
  reportingTo?: string;
  workLocation?: string;
  nominee1FullName?: string;
  nominee1Relationship?: string;
  nominee1Dob?: string;
  nominee1Mobile?: string;
  nominee1Address?: string;
  nominee1Percentage?: string;
  nominee2FullName?: string;
  nominee2Relationship?: string;
  nominee2Dob?: string;
  nominee2Mobile?: string;
  nominee2Percentage?: string;
  nominee2Address?: string;
  guardianMobile?: string;
  verifiedBy?: string;
  verifierRemarks?: string;

  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  nominationType: 'PF' | 'Gratuity' | 'Insurance';
  nominees: INominee[];
  // Validation: nominees share must sum to 100
  declarationDate?: Date;
  declarationPlace?: string;
  witnessName?: string;
  witnessDesignation?: string;
  hrVerifiedBy?: string;
  hrVerifiedDate?: Date;
  hrRemarks?: string;
  pdfUrl?: string;
  status: 'Pending' | 'Submitted' | 'Verified';
}

const nominationSchema = new Schema<INomination>({
  employeeName: { type: String },
  empCode: { type: String },
  designation: { type: String },
  department: { type: String },
  fatherHusbandSpouse: { type: String },
  gender: { type: String },
  dateOfJoining: { type: String },
  mobileNumber: { type: String },
  emailId: { type: String },
  reportingTo: { type: String },
  workLocation: { type: String },
  nominee1FullName: { type: String },
  nominee1Relationship: { type: String },
  nominee1Dob: { type: String },
  nominee1Mobile: { type: String },
  nominee1Address: { type: String },
  nominee1Percentage: { type: String },
  nominee2FullName: { type: String },
  nominee2Relationship: { type: String },
  nominee2Dob: { type: String },
  nominee2Mobile: { type: String },
  nominee2Percentage: { type: String },
  nominee2Address: { type: String },
  guardianMobile: { type: String },
  verifiedBy: { type: String },
  verifierRemarks: { type: String },

  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  nominationType: { type: String, enum: ['PF', 'Gratuity', 'Insurance'], required: true },
  nominees: [{
    name: { type: String, required: true },
    relationship: { type: String, required: true },
    dob: { type: Date },
    age: { type: Number },
    sharePercentage: { type: Number, required: true, min: 0, max: 100 },
    address: { type: String },
    isMinor: { type: Boolean, default: false },
    guardianName: { type: String },
    guardianRelationship: { type: String },
    guardianAddress: { type: String },
  }],
  declarationDate: { type: Date },
  declarationPlace: { type: String },
  witnessName: { type: String },
  witnessDesignation: { type: String },
  hrVerifiedBy: { type: String },
  hrVerifiedDate: { type: Date },
  hrRemarks: { type: String },
  pdfUrl: { type: String },
  status: { type: String, enum: ['Pending', 'Submitted', 'Verified'], default: 'Pending' }
}, { timestamps: true });

nominationSchema.plugin(tenantPlugin);

export const Nomination = mongoose.model<INomination>('Nomination', nominationSchema);

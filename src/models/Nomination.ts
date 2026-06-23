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

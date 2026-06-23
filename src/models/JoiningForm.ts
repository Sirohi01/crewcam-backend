import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IJoiningForm extends ITenantScoped {
  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  personalDetails: {
    dob?: Date;
    gender?: string;
    maritalStatus?: string;
    bloodGroup?: string;
    nationality?: string;
  };
  addressDetails: {
    currentAddress?: string;
    permanentAddress?: string;
  };
  previousEmployment: {
    companyName: string;
    designation?: string;
    fromDate?: Date;
    toDate?: Date;
    reasonForLeaving?: string;
  }[];
  educationDetails: {
    degree: string;
    institution?: string;
    yearOfPassing?: number;
    percentage?: number;
  }[];
  status: 'Pending' | 'Submitted' | 'Verified';
}

const joiningFormSchema = new Schema<IJoiningForm>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  personalDetails: {
    dob: { type: Date },
    gender: { type: String },
    maritalStatus: { type: String },
    bloodGroup: { type: String },
    nationality: { type: String }
  },
  addressDetails: {
    currentAddress: { type: String },
    permanentAddress: { type: String }
  },
  previousEmployment: [{
    companyName: { type: String, required: true },
    designation: { type: String },
    fromDate: { type: Date },
    toDate: { type: Date },
    reasonForLeaving: { type: String }
  }],
  educationDetails: [{
    degree: { type: String, required: true },
    institution: { type: String },
    yearOfPassing: { type: Number },
    percentage: { type: Number }
  }],
  status: { type: String, enum: ['Pending', 'Submitted', 'Verified'], default: 'Pending' }
}, { timestamps: true });

joiningFormSchema.plugin(tenantPlugin);

export const JoiningForm = mongoose.model<IJoiningForm>('JoiningForm', joiningFormSchema);

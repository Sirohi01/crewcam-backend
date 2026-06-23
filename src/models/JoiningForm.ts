import mongoose, { Schema, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IJoiningForm extends ITenantScoped {
  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;

  // 1. Personal Details
  personalDetails: {
    fullName?: string;
    dob?: Date;
    gender?: string;
    maritalStatus?: string;
    marriageAnniversary?: Date;
    bloodGroup?: string;
    nationality?: string;
    fatherMotherName?: string;
    religion?: string;
    caste?: string;
  };

  // 2. Contact Details
  contactDetails: {
    mobileNumber?: string;
    alternateNumber?: string;
    personalEmail?: string;
    currentAddress?: string;
    permanentAddress?: string;
    sameAsCurrentAddress?: boolean;
  };

  // 3. Position & Employment
  positionDetails: {
    designation?: string;
    department?: string;
    joiningDate?: Date;
    reportingManager?: string;
    workLocation?: string;
    employeeCategory?: string;
    empCode?: string;
    paymentMode?: string;
  };

  // 4. Identification
  identificationDetails: {
    aadhaarNumber?: string;
    panNumber?: string;
    drivingLicense?: string;
    passportNumber?: string;
    voterId?: string;
    uanNumber?: string;
    pfNumber?: string;
    esiNumber?: string;
  };

  // 5. Bank Account
  bankDetails: {
    accountHolderName?: string;
    bankName?: string;
    branchName?: string;
    accountNumber?: string;
    ifscCode?: string;
    accountType?: string;
  };

  // 6. Emergency Contact
  emergencyContact: {
    name?: string;
    relationship?: string;
    mobileNumber?: string;
    alternateNumber?: string;
    address?: string;
  };

  // 7. Education
  educationDetails: {
    qualification?: string;
    institution?: string;
    yearOfPassing?: string;
    percentage?: string;
    documentSubmitted?: boolean;
  }[];

  // 8. Previous Employment
  previousEmployment: {
    companyName?: string;
    designation?: string;
    fromDate?: Date;
    toDate?: Date;
    lastSalary?: string;
    reasonForLeaving?: string;
    totalExperience?: string;
  }[];

  // 9. Document Submission
  documents: {
    name?: string;
    status?: string;
  }[];
  documentVerifiedBy?: string;

  // 10. Operational Details
  operationalDetails: {
    attendanceMode?: string;
    dutyLocation?: string;
    weeklyOff?: string;
    shift?: string;
    dutyTimingFrom?: string;
    dutyTimingTo?: string;
    crewcamRole?: string;
  };

  // 11. Declaration & Approval
  declaration: {
    employeeSignature?: string;
    signDate?: Date;
    hrVerifiedBy?: string;
    hrDesignation?: string;
    hrDate?: Date;
    hrRemarks?: string;
  };

  approvalStatus: 'Pending' | 'Verified';
  status: 'Pending' | 'Submitted' | 'Verified';
  pdfUrl?: string;
}

const joiningFormSchema = new Schema<IJoiningForm>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },

  personalDetails: {
    fullName: { type: String },
    dob: { type: Date },
    gender: { type: String },
    maritalStatus: { type: String },
    marriageAnniversary: { type: Date },
    bloodGroup: { type: String },
    nationality: { type: String, default: 'Indian' },
    fatherMotherName: { type: String },
    religion: { type: String },
    caste: { type: String },
  },

  contactDetails: {
    mobileNumber: { type: String },
    alternateNumber: { type: String },
    personalEmail: { type: String },
    currentAddress: { type: String },
    permanentAddress: { type: String },
    sameAsCurrentAddress: { type: Boolean, default: false },
  },

  positionDetails: {
    designation: { type: String },
    department: { type: String },
    joiningDate: { type: Date },
    reportingManager: { type: String },
    workLocation: { type: String },
    employeeCategory: { type: String },
    empCode: { type: String },
    paymentMode: { type: String },
  },

  identificationDetails: {
    aadhaarNumber: { type: String },
    panNumber: { type: String },
    drivingLicense: { type: String },
    passportNumber: { type: String },
    voterId: { type: String },
    uanNumber: { type: String },
    pfNumber: { type: String },
    esiNumber: { type: String },
  },

  bankDetails: {
    accountHolderName: { type: String },
    bankName: { type: String },
    branchName: { type: String },
    accountNumber: { type: String },
    ifscCode: { type: String },
    accountType: { type: String },
  },

  emergencyContact: {
    name: { type: String },
    relationship: { type: String },
    mobileNumber: { type: String },
    alternateNumber: { type: String },
    address: { type: String },
  },

  educationDetails: [{
    qualification: { type: String },
    institution: { type: String },
    yearOfPassing: { type: String },
    percentage: { type: String },
    documentSubmitted: { type: Boolean, default: false },
  }],

  previousEmployment: [{
    companyName: { type: String },
    designation: { type: String },
    fromDate: { type: Date },
    toDate: { type: Date },
    lastSalary: { type: String },
    reasonForLeaving: { type: String },
    totalExperience: { type: String },
  }],

  documents: [{
    name: { type: String },
    status: { type: String, default: 'Pending' },
  }],
  documentVerifiedBy: { type: String },

  operationalDetails: {
    attendanceMode: { type: String },
    dutyLocation: { type: String },
    weeklyOff: { type: String },
    shift: { type: String },
    dutyTimingFrom: { type: String },
    dutyTimingTo: { type: String },
    crewcamRole: { type: String },
  },

  declaration: {
    employeeSignature: { type: String },
    signDate: { type: Date },
    hrVerifiedBy: { type: String },
    hrDesignation: { type: String },
    hrDate: { type: Date },
    hrRemarks: { type: String },
  },

  approvalStatus: { type: String, enum: ['Pending', 'Verified'], default: 'Pending' },
  status: { type: String, enum: ['Pending', 'Submitted', 'Verified'], default: 'Pending' },
  pdfUrl: { type: String },
}, { timestamps: true });

joiningFormSchema.plugin(tenantPlugin);

export const JoiningForm = mongoose.model<IJoiningForm>('JoiningForm', joiningFormSchema);

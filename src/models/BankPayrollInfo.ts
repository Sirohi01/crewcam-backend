import mongoose, { Schema, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { encrypt, decrypt } from '../utils/encryption';

export interface IBankPayrollInfo extends ITenantScoped {
  employeeName?: string;
  empCode?: string;
  designation?: string;
  department?: string;
  dateOfJoining?: string;
  workLocation?: string;
  reportingTo?: string;
  receivePayslipOnEmail?: string;
  payslipEmailId?: string;
  verifiedBy?: string;
  verificationDate?: string;

  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;

  // Bank Account
  bankName: string;
  accountHolderName: string;
  accountNumber: string;       // stored encrypted
  ifscCode: string;
  branchName?: string;
  accountType: 'Savings' | 'Current';
  micrCode?: string;

  // Statutory IDs (stored encrypted where sensitive)
  panNumber?: string;          // stored encrypted
  aadhaarNumber?: string;      // stored encrypted
  uanNumber?: string;
  pfAccountNumber?: string;
  esiNumber?: string;

  // Payroll preferences
  paymentMode?: 'Bank Transfer' | 'Cheque' | 'Cash';
  pfApplicable?: boolean;
  esiApplicable?: boolean;
  ptApplicable?: boolean;      // Professional Tax
  lwfApplicable?: boolean;     // Labour Welfare Fund

  // Documents submitted
  documents: {
    name: string;
    status: 'Pending' | 'Submitted' | 'Verified';
  }[];

  // Employee declaration
  employeeDeclaration?: boolean;
  declarationDate?: Date;

  // HR verification
  hrVerifiedBy?: string;
  hrVerifiedDate?: Date;
  hrRemarks?: string;

  status: 'Pending' | 'Submitted' | 'Verified';
  pdfUrl?: string;

  // Instance methods
  getDecryptedAccountNumber(): string;
  getDecryptedPan(): string | undefined;
  getDecryptedAadhaar(): string | undefined;
}

const bankPayrollInfoSchema = new Schema<IBankPayrollInfo>({
  employeeName: { type: String },
  empCode: { type: String },
  designation: { type: String },
  department: { type: String },
  dateOfJoining: { type: String },
  workLocation: { type: String },
  reportingTo: { type: String },
  receivePayslipOnEmail: { type: String },
  payslipEmailId: { type: String },
  verifiedBy: { type: String },
  verificationDate: { type: String },

  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },

  bankName: { type: String, required: true },
  accountHolderName: { type: String, required: true },
  accountNumber: { type: String, required: true },
  ifscCode: { type: String, required: true },
  branchName: { type: String },
  accountType: { type: String, enum: ['Savings', 'Current'], default: 'Savings' },
  micrCode: { type: String },

  panNumber: { type: String },
  aadhaarNumber: { type: String },
  uanNumber: { type: String },
  pfAccountNumber: { type: String },
  esiNumber: { type: String },

  paymentMode: { type: String, enum: ['Bank Transfer', 'Cheque', 'Cash'], default: 'Bank Transfer' },
  pfApplicable: { type: Boolean, default: false },
  esiApplicable: { type: Boolean, default: false },
  ptApplicable: { type: Boolean, default: false },
  lwfApplicable: { type: Boolean, default: false },

  documents: [{
    name: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Submitted', 'Verified'], default: 'Pending' },
  }],

  employeeDeclaration: { type: Boolean, default: false },
  declarationDate: { type: Date },

  hrVerifiedBy: { type: String },
  hrVerifiedDate: { type: Date },
  hrRemarks: { type: String },

  status: { type: String, enum: ['Pending', 'Submitted', 'Verified'], default: 'Pending' },
  pdfUrl: { type: String },
}, {
  timestamps: true,
  toJSON: {
    transform: (_doc, ret: any) => {
      // Always mask sensitive fields in JSON output
      if (ret.accountNumber) {
        try {
          const decrypted = decrypt(ret.accountNumber);
          ret.accountNumber = `XXXXXX${decrypted.slice(-4)}`;
        } catch { ret.accountNumber = 'XXXXXXXXXX'; }
      }
      if (ret.panNumber) {
        try {
          const decrypted = decrypt(ret.panNumber);
          ret.panNumber = `XXXXX${decrypted.slice(-4)}`;
        } catch { ret.panNumber = 'XXXXXXXXX'; }
      }
      if (ret.aadhaarNumber) {
        try {
          const decrypted = decrypt(ret.aadhaarNumber);
          ret.aadhaarNumber = `XXXX XXXX ${decrypted.slice(-4)}`;
        } catch { ret.aadhaarNumber = 'XXXX XXXX XXXX'; }
      }
      return ret;
    }
  }
});

// Encrypt sensitive fields before save
bankPayrollInfoSchema.pre('save', function (this: any) {
  if (this.isModified('accountNumber') && this.accountNumber) {
    this.accountNumber = encrypt(this.accountNumber);
  }
  if (this.isModified('panNumber') && this.panNumber) {
    this.panNumber = encrypt(this.panNumber);
  }
  if (this.isModified('aadhaarNumber') && this.aadhaarNumber) {
    this.aadhaarNumber = encrypt(this.aadhaarNumber);
  }
});

bankPayrollInfoSchema.methods.getDecryptedAccountNumber = function (this: any) {
  return decrypt(this.accountNumber);
};

bankPayrollInfoSchema.methods.getDecryptedPan = function (this: any) {
  return this.panNumber ? decrypt(this.panNumber) : undefined;
};

bankPayrollInfoSchema.methods.getDecryptedAadhaar = function (this: any) {
  return this.aadhaarNumber ? decrypt(this.aadhaarNumber) : undefined;
};

bankPayrollInfoSchema.plugin(tenantPlugin);

export const BankPayrollInfo = mongoose.model<IBankPayrollInfo>('BankPayrollInfo', bankPayrollInfoSchema);

import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { encrypt, decrypt } from '../utils/encryption';

export interface IBankPayrollInfo extends ITenantScoped {
  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  branchName?: string;
  accountType: 'Savings' | 'Current';
  panNumber?: string;
  uanNumber?: string;
  status: 'Pending' | 'Submitted' | 'Verified';
  getDecryptedAccountNumber(): string;
  getDecryptedPan(): string | undefined;
}

const bankPayrollInfoSchema = new Schema<IBankPayrollInfo>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  bankName: { type: String, required: true },
  accountHolderName: { type: String, required: true },
  accountNumber: { type: String, required: true },
  ifscCode: { type: String, required: true },
  branchName: { type: String },
  accountType: { type: String, enum: ['Savings', 'Current'], default: 'Savings' },
  panNumber: { type: String },
  uanNumber: { type: String },
  status: { type: String, enum: ['Pending', 'Submitted', 'Verified'], default: 'Pending' }
}, {
  timestamps: true,
  toJSON: {
    transform: (_doc, ret: any) => {
      if (ret.accountNumber) {
        const decrypted = decrypt(ret.accountNumber);
        ret.accountNumber = `XXXXXX${decrypted.slice(-4)}`;
      }
      if (ret.panNumber) {
        const decrypted = decrypt(ret.panNumber);
        ret.panNumber = `XXXXX${decrypted.slice(-4)}`;
      }
      return ret;
    }
  }
});

bankPayrollInfoSchema.pre('save', function (this: any) {
  if (this.isModified('accountNumber') && this.accountNumber) {
    this.accountNumber = encrypt(this.accountNumber);
  }
  if (this.isModified('panNumber') && this.panNumber) {
    this.panNumber = encrypt(this.panNumber);
  }
});

bankPayrollInfoSchema.methods.getDecryptedAccountNumber = function (this: any) {
  return decrypt(this.accountNumber);
};

bankPayrollInfoSchema.methods.getDecryptedPan = function (this: any) {
  return this.panNumber ? decrypt(this.panNumber) : undefined;
};

bankPayrollInfoSchema.plugin(tenantPlugin);

export const BankPayrollInfo = mongoose.model<IBankPayrollInfo>('BankPayrollInfo', bankPayrollInfoSchema);

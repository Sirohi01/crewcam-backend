import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IExpense extends Document {
  tenantId: Types.ObjectId;
  employeeId: Types.ObjectId;
  type: 'Travel' | 'Food' | 'Fuel' | 'Hotel' | 'Other';
  amount: number;
  date: Date;
  description: string;
  receiptUrl?: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Reimbursed' | 'Withdrawn';
  approverComments?: string;
}

const expenseSchema = new Schema<IExpense>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { 
    type: String, 
    enum: ['Travel', 'Food', 'Fuel', 'Hotel', 'Other'], 
    required: true 
  },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, required: true },
  description: { type: String, required: true },
  receiptUrl: { type: String },
  status: { 
    type: String, 
    // Withdrawn = pulled back by the employee before a decision.
    enum: ['Pending', 'Approved', 'Rejected', 'Reimbursed', 'Withdrawn'], 
    default: 'Pending' 
  },
  approverComments: { type: String }
}, {
  timestamps: true
});

import { tenantPlugin } from './plugins/tenantPlugin';
expenseSchema.plugin(tenantPlugin);

export const Expense = mongoose.model<IExpense>('Expense', expenseSchema);

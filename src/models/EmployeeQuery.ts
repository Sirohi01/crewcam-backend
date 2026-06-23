import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

export interface IEmployeeQuery extends Document {
  tenantId: Types.ObjectId;
  raisedBy: Types.ObjectId;
  subject: string;
  message: string;
  status: 'Open' | 'InProgress' | 'Resolved';
  response?: string;
  respondedBy?: Types.ObjectId;
  respondedAt?: Date;
}

const employeeQuerySchema = new Schema<IEmployeeQuery>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  raisedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ['Open', 'InProgress', 'Resolved'], default: 'Open' },
  response: { type: String },
  respondedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  respondedAt: { type: Date },
}, { timestamps: true });

employeeQuerySchema.plugin(tenantPlugin);

export const EmployeeQuery = mongoose.model<IEmployeeQuery>('EmployeeQuery', employeeQuerySchema);

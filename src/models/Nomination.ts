import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface INominee {
  name: string;
  relationship: string;
  dob?: Date;
  sharePercentage: number;
  address?: string;
  isMinor: boolean;
  guardianName?: string;
}

export interface INomination extends ITenantScoped {
  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  nominationType: 'PF' | 'Gratuity' | 'Insurance';
  nominees: INominee[];
  status: 'Pending' | 'Submitted';
}

const nominationSchema = new Schema<INomination>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  nominationType: { type: String, enum: ['PF', 'Gratuity', 'Insurance'], required: true },
  nominees: [{
    name: { type: String, required: true },
    relationship: { type: String, required: true },
    dob: { type: Date },
    sharePercentage: { type: Number, required: true, min: 0, max: 100 },
    address: { type: String },
    isMinor: { type: Boolean, default: false },
    guardianName: { type: String }
  }],
  status: { type: String, enum: ['Pending', 'Submitted'], default: 'Pending' }
}, { timestamps: true });

nominationSchema.plugin(tenantPlugin);

export const Nomination = mongoose.model<INomination>('Nomination', nominationSchema);

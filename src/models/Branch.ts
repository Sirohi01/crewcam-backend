import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IBranch extends ITenantScoped, IAuditable {
  name: string;
  code: string;
  location?: string;
  address?: string;
  pincode?: string;
  city?: string;
  state?: string;
  country?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  reportingTo?: string;
  effectiveDate?: string;
  timezone?: string;
  workingDays?: string[];
  workStart?: string;
  workEnd?: string;
  logoUrl?: string;
  lat?: number;
  lng?: number;
  isActive: boolean;
}

const BranchSchema = new Schema<IBranch>({
  name: { type: String, required: true },
  code: { type: String, required: true },
  location: { type: String },
  address: { type: String },
  pincode: { type: String },
  city: { type: String },
  state: { type: String },
  country: { type: String, default: 'India' },
  contactPerson: { type: String },
  contactPhone: { type: String },
  contactEmail: { type: String },
  reportingTo: { type: String },
  effectiveDate: { type: String },
  timezone: { type: String, default: 'Asia/Kolkata' },
  workingDays: [{ type: String }],
  workStart: { type: String, default: '09:30' },
  workEnd: { type: String, default: '18:30' },
  logoUrl: { type: String },
  lat: { type: Number },
  lng: { type: Number },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

BranchSchema.plugin(tenantPlugin);
BranchSchema.plugin(auditPlugin);

export const Branch = mongoose.model<IBranch>('Branch', BranchSchema);

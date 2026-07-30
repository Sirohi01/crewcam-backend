import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMeeting extends Document {
  tenantId: Types.ObjectId;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  organizerId: Types.ObjectId;
  attendeeIds: Types.ObjectId[];
  meetingLink?: string;
  status: string;
  mode: 'Online' | 'Field';
  location?: string;
  address?: string;
  pincode?: string;
  city?: string;
  state?: string;
  country?: string;
  lat?: number;
  lng?: number;
  createdLat?: number;
  createdLng?: number;
  completedAt?: Date;
  completedBy?: Types.ObjectId;
  linkedExpenseId?: Types.ObjectId;
}

const meetingSchema = new Schema<IMeeting>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  title: { type: String, required: true },
  description: { type: String },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  organizerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  attendeeIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  meetingLink: { type: String },
  status: { type: String, required: true, default: 'Scheduled' },
  mode: { type: String, enum: ['Online', 'Field'], default: 'Online' },
  location: { type: String },
  address: { type: String },
  pincode: { type: String },
  city: { type: String },
  state: { type: String },
  country: { type: String, default: 'India' },
  lat: { type: Number },
  lng: { type: Number },
  createdLat: { type: Number },
  createdLng: { type: Number },
  completedAt: { type: Date },
  completedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  linkedExpenseId: { type: Schema.Types.ObjectId, ref: 'Expense' },
}, {
  timestamps: true
});

import { tenantPlugin } from './plugins/tenantPlugin';
meetingSchema.plugin(tenantPlugin);

export const Meeting = mongoose.model<IMeeting>('Meeting', meetingSchema);

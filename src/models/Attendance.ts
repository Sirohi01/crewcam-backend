import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAttendance extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  date: Date;
  clockInTime: Date;
  clockOutTime?: Date;
  status: 'Present' | 'Absent' | 'Half-Day' | 'On Leave';
  locationIp?: string;
  clockInLocation?: { lat: number; lng: number };
  clockOutLocation?: { lat: number; lng: number };
  totalHours?: number;
}

const attendanceSchema = new Schema<IAttendance>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: Date, required: true },
  clockInTime: { type: Date, required: true },
  clockOutTime: { type: Date },
  status: { type: String, enum: ['Present', 'Absent', 'Half-Day', 'On Leave'], default: 'Present' },
  locationIp: { type: String },
  clockInLocation: {
    lat: { type: Number },
    lng: { type: Number }
  },
  clockOutLocation: {
    lat: { type: Number },
    lng: { type: Number }
  },
  totalHours: { type: Number }
}, {
  timestamps: true
});

import { tenantPlugin } from './plugins/tenantPlugin';
attendanceSchema.plugin(tenantPlugin);

export const Attendance = mongoose.model<IAttendance>('Attendance', attendanceSchema);

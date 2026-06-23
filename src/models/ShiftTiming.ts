import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IShiftTiming extends ITenantScoped, IAuditable {
  name: string;
  code?: string;
  description?: string;
  checkInTime: string; // e.g., "09:00"
  checkOutTime: string; // e.g., "18:00"
  gracePeriodLC: number; // Late coming grace period in minutes
  gracePeriodEG: number; // Early going grace period in minutes
  halfDayThresholdMHD: number; // Minimum hours to avoid Morning Half Day
  absentThreshold: string; // Time after which marked absent, e.g., "12:00"
  isSandwichRuleApplicable: boolean;
  weekOffDays: string[]; // e.g., ['Saturday', 'Sunday']
  workOnWeekOffMultiplier: number; // e.g., 2.0
  workOnHolidayMultiplier: number; // e.g., 2.0
  isActive: boolean;
}

const shiftTimingSchema = new Schema<IShiftTiming>({
  name: { type: String, required: true, trim: true },
  code: { type: String, trim: true },
  description: { type: String },
  checkInTime: { type: String, required: true },
  checkOutTime: { type: String, required: true },
  gracePeriodLC: { type: Number, default: 15 },
  gracePeriodEG: { type: Number, default: 15 },
  halfDayThresholdMHD: { type: Number, default: 4 },
  absentThreshold: { type: String, default: '12:00' },
  isSandwichRuleApplicable: { type: Boolean, default: false },
  weekOffDays: { type: [String], default: ['Sunday'] },
  workOnWeekOffMultiplier: { type: Number, default: 2.0 },
  workOnHolidayMultiplier: { type: Number, default: 2.0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

shiftTimingSchema.index({ tenantId: 1, name: 1 });
shiftTimingSchema.plugin(tenantPlugin);
shiftTimingSchema.plugin(auditPlugin);

export const ShiftTiming = mongoose.models.ShiftTiming || mongoose.model<IShiftTiming>('ShiftTiming', shiftTimingSchema, 'shiftTimings');

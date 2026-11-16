import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

/**
 * An employee's "Trigger Emergency Alert" (Phase 1D-3b). Responders (EMERGENCY_RESPOND)
 * and the reporting manager are notified; they acknowledge and resolve it. The employee
 * can cancel it as a false alarm. Each emergency-contact text is recorded with whether
 * it was actually delivered to an SMS provider or only simulated.
 */
export type EmergencyAlertStatus = 'Active' | 'Acknowledged' | 'Resolved' | 'Cancelled';

export interface IContactNotice {
  name: string;
  mobile: string;
  result: 'sent' | 'not-configured' | 'failed';
}

export interface IEmergencyAlert extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  status: EmergencyAlertStatus;
  message?: string;
  location?: { lat: number; lng: number; accuracy?: number };
  respondersNotified: number;
  contactNotices: IContactNotice[];
  acknowledgedBy?: Types.ObjectId;
  acknowledgedAt?: Date;
  resolvedBy?: Types.ObjectId;
  resolvedAt?: Date;
  resolutionNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const emergencyAlertSchema = new Schema<IEmergencyAlert>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['Active', 'Acknowledged', 'Resolved', 'Cancelled'], default: 'Active' },
  message: { type: String, maxlength: 500 },
  location: {
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    accuracy: { type: Number, min: 0 },
  },
  respondersNotified: { type: Number, default: 0 },
  contactNotices: [{
    _id: false,
    name: String,
    mobile: String,
    result: { type: String, enum: ['sent', 'not-configured', 'failed'] },
  }],
  acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  acknowledgedAt: { type: Date },
  resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: { type: Date },
  resolutionNote: { type: String, maxlength: 1000 },
}, { timestamps: true });

emergencyAlertSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
emergencyAlertSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
emergencyAlertSchema.plugin(tenantPlugin);

export const EmergencyAlert = mongoose.model<IEmergencyAlert>('EmergencyAlert', emergencyAlertSchema);

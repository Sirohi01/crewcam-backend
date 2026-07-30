import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

export interface INotification extends Document {
  tenantId: Types.ObjectId;
  title: string;
  message: string;
  audienceType: 'All' | 'Role' | 'Department' | 'Branch' | 'User';
  audienceValue?: Types.ObjectId | string;
  link?: string;
  createdBy: Types.ObjectId;
  readBy: Types.ObjectId[];
}

const notificationSchema = new Schema<INotification>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  // 'User' targets a single employee directly (audienceValue = their _id) — added for
  // event-triggered notifications (e.g. meeting completed, MoM action item assigned)
  // alongside the original HR broadcast-to-cohort types.
  audienceType: { type: String, enum: ['All', 'Role', 'Department', 'Branch', 'User'], default: 'All' },
  audienceValue: { type: Schema.Types.Mixed },
  link: { type: String },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

notificationSchema.plugin(tenantPlugin);

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);

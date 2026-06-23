import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

export interface IActionItem {
  description: string;
  assignedTo?: Types.ObjectId;
  dueDate?: Date;
  status: 'Open' | 'Done';
}

export interface IMeetingMoM extends Document {
  tenantId: Types.ObjectId;
  meetingId: Types.ObjectId;
  content: string;
  attendeesPresent: Types.ObjectId[];
  actionItems: IActionItem[];
  createdBy: Types.ObjectId;
}

const actionItemSchema = new Schema<IActionItem>({
  description: { type: String, required: true },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  dueDate: { type: Date },
  status: { type: String, enum: ['Open', 'Done'], default: 'Open' },
}, { _id: false });

const meetingMoMSchema = new Schema<IMeetingMoM>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true, index: true, unique: true },
  content: { type: String, required: true },
  attendeesPresent: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  actionItems: [actionItemSchema],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

meetingMoMSchema.plugin(tenantPlugin);

export const MeetingMoM = mongoose.model<IMeetingMoM>('MeetingMoM', meetingMoMSchema);

import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';
import { auditPlugin } from './plugins/auditPlugin';

export interface ITicket extends Document {
  tenantId: Types.ObjectId;
  employeeId: Types.ObjectId;
  department: string;
  subject: string;
  description: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  status: 'Open' | 'In_Progress' | 'Resolved' | 'Closed';
  assignedTo?: Types.ObjectId;
  resolution?: string;
  resolvedAt?: Date;
  ticketNumber?: string;
  rating?: number;
  feedback?: string;
  ratedAt?: Date;
  channel?: 'helpdesk' | 'platform';
  attachmentUrl?: string;
  pageUrl?: string;
  assetId?: Types.ObjectId;
}

export const TICKET_CATEGORIES = ['IT', 'HR', 'Finance', 'Facility', 'Other'] as const;

const ticketSchema = new Schema<ITicket>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  department: { type: String, required: true }, // e.g., IT, HR, Finance, Facility
  subject: { type: String, required: true },
  description: { type: String, required: true },
  priority: { 
    type: String, 
    enum: ['Low', 'Medium', 'High', 'Urgent'], 
    default: 'Medium' 
  },
  status: { 
    type: String, 
    enum: ['Open', 'In_Progress', 'Resolved', 'Closed'], 
    default: 'Open' 
  },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  resolution: { type: String },
  resolvedAt: { type: Date },
  // Human-readable reference, e.g. HD-2026-0007 (per tenant, per year).
  ticketNumber: { type: String },
  // The employee's rating of how their ticket was handled (1-5), once it is resolved.
  rating: { type: Number, min: 1, max: 5 },
  feedback: { type: String },
  ratedAt: { type: Date },
  // 'platform' = a problem report about CrewCam itself (the floating "Report a problem"
  // button). Those go to the CrewCam team (super admin), not the company's helpdesk queue.
  channel: { type: String, enum: ['helpdesk', 'platform'], default: 'helpdesk', index: true },
  attachmentUrl: { type: String }, // uploaded through /upload (screenshot, photo of damage…)
  pageUrl: { type: String },       // app page the report was made from
  assetId: { type: Schema.Types.ObjectId, ref: 'Asset' }, // asset the ticket is about
}, {
  timestamps: true
});

ticketSchema.plugin(tenantPlugin);
ticketSchema.plugin(auditPlugin);

export const Ticket = mongoose.model<ITicket>('Ticket', ticketSchema);

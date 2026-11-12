import mongoose, { Schema, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

/**
 * An employee's request to change HR-owned data (identity details or the salary bank
 * account), approved or rejected by HR (Phase 1E). Proposed values are stored
 * encrypted (`proposedEncrypted`, a JSON object), because they include PAN, Aadhaar and
 * account numbers; `summary` holds a masked, display-safe copy for lists.
 */
export type ChangeRequestKind = 'identity' | 'bank';
export type ChangeRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface IChangeSummaryItem {
  field: string;
  label: string;
  from: string; // masked where sensitive
  to: string;   // masked where sensitive
}

export interface IProfileChangeRequest extends ITenantScoped, IAuditable {
  userId: Types.ObjectId;
  kind: ChangeRequestKind;
  proposedEncrypted: string;
  summary: IChangeSummaryItem[];
  employeeComment?: string;
  attachmentUrl?: string;
  status: ChangeRequestStatus;
  reviewerId?: Types.ObjectId;
  reviewerComment?: string;
  reviewedAt?: Date;
}

const ProfileChangeRequestSchema = new Schema<IProfileChangeRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['identity', 'bank'], required: true },
    proposedEncrypted: { type: String, required: true, select: false },
    summary: [{
      _id: false,
      field: { type: String, required: true },
      label: { type: String, required: true },
      from: { type: String, default: '' },
      to: { type: String, default: '' },
    }],
    employeeComment: { type: String, trim: true, maxlength: 1000 },
    attachmentUrl: { type: String },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'], default: 'Pending', index: true },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewerComment: { type: String, trim: true, maxlength: 1000 },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

ProfileChangeRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
ProfileChangeRequestSchema.index({ tenantId: 1, userId: 1, kind: 1, status: 1 });

ProfileChangeRequestSchema.plugin(tenantPlugin);
ProfileChangeRequestSchema.plugin(auditPlugin);

export const ProfileChangeRequest = mongoose.model<IProfileChangeRequest>('ProfileChangeRequest', ProfileChangeRequestSchema);

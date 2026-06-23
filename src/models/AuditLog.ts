import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IAuditLog extends ITenantScoped {
  userId?: string | mongoose.Types.ObjectId;
  action: string;
  module: string;
  ipAddress?: string;
  userAgent?: string;
  status: 'SUCCESS' | 'FAILURE';
  details?: Record<string, any>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  tenantId: { type: String, required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true },
  module: { type: String, required: true },
  ipAddress: { type: String },
  userAgent: { type: String },
  status: { type: String, enum: ['SUCCESS', 'FAILURE'], required: true },
  details: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

auditLogSchema.plugin(tenantPlugin);

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

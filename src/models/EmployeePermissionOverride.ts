import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IEmployeePermissionOverride extends ITenantScoped, IAuditable {
  userId: mongoose.Types.ObjectId;
  grants: string[];
  revokes: string[];
  reason: string;
  grantedBy: string;
  expiresAt?: Date;
}

const EmployeePermissionOverrideSchema = new Schema<IEmployeePermissionOverride>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  grants: [{ type: String }],
  revokes: [{ type: String }],
  reason: { type: String, required: true },
  grantedBy: { type: String },
  expiresAt: { type: Date },
}, { timestamps: true });

EmployeePermissionOverrideSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

EmployeePermissionOverrideSchema.plugin(tenantPlugin);
EmployeePermissionOverrideSchema.plugin(auditPlugin);

export const EmployeePermissionOverride = mongoose.model<IEmployeePermissionOverride>(
  'EmployeePermissionOverride',
  EmployeePermissionOverrideSchema
);

import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface ITenant extends Document, IAuditable {
  name: string;
  isActive: boolean;
  packageId: mongoose.Types.ObjectId;
  aiCredits: number;
}

const TenantSchema = new Schema<ITenant>({
  name: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  packageId: { type: Schema.Types.ObjectId, ref: 'Package' },
  aiCredits: { type: Number, default: 0 },
}, { timestamps: true });

TenantSchema.plugin(auditPlugin);

export const Tenant = mongoose.model<ITenant>('Tenant', TenantSchema);

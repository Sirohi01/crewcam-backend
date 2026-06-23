import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

/**
 * Per-role enable/disable for Employee Live Tracking — explicitly NOT a single
 * global switch (docs/modules/31_MEETINGS_AND_COMMUNICATIONS.md §3: Company Admin
 * enables/disables per role, e.g. field staff only, not office employees by default).
 */
export interface ILiveTrackingConfig extends Document {
  tenantId: Types.ObjectId;
  roleId: Types.ObjectId;
  enabled: boolean;
}

const liveTrackingConfigSchema = new Schema<ILiveTrackingConfig>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
  enabled: { type: Boolean, default: false },
}, { timestamps: true });

liveTrackingConfigSchema.index({ tenantId: 1, roleId: 1 }, { unique: true });
liveTrackingConfigSchema.plugin(tenantPlugin);

export const LiveTrackingConfig = mongoose.model<ILiveTrackingConfig>('LiveTrackingConfig', liveTrackingConfigSchema);

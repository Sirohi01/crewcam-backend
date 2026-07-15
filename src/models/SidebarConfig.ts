import mongoose, { Schema } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface ISidebarConfig extends ITenantScoped, IAuditable {
  section: string;
  sectionOrder: number;
  label: string;
  href: string;
  icon: string;
  order: number;
  parent?: string;
  requiredPermission?: string;
  requiredFeature?: string;
  // Opt-in fine-grained targeting: specific Role documents (e.g. a tenant's "HR Recruiter"
  // role) that can see this item. Empty/unset means "no extra role restriction" —
  // requiredPermission/requiredFeature (or nothing at all) decide visibility alone.
  roleIds: mongoose.Types.ObjectId[];
  isActive: boolean;
}

const SidebarConfigSchema = new Schema<ISidebarConfig>({
  section: { type: String, required: true },
  sectionOrder: { type: Number, required: true, default: 999 },
  label: { type: String, required: true },
  href: { type: String, required: true },
  icon: { type: String, default: 'Circle' },
  order: { type: Number, required: true, default: 0 },
  parent: { type: String },
  requiredPermission: { type: String },
  requiredFeature: { type: String },
  roleIds: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

SidebarConfigSchema.index({ tenantId: 1, sectionOrder: 1, order: 1 });

SidebarConfigSchema.plugin(tenantPlugin);
SidebarConfigSchema.plugin(auditPlugin);

export const SidebarConfig = mongoose.model<ISidebarConfig>('SidebarConfig', SidebarConfigSchema);

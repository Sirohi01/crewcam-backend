import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export const ROLE_CATEGORIES = [
  'employee',
  'reporting_manager',
  'hod',
  'hr',
  'hr_admin',
  'finance',
  'admin',
  'company_admin',
  'developer',
] as const;

export type RoleCategory = typeof ROLE_CATEGORIES[number];

export interface IRole extends ITenantScoped, IAuditable {
  name: string;
  description: string;
  permissions: string[];
  category: RoleCategory;
  isActive: boolean;
}

const RoleSchema = new Schema<IRole>({
  name: { type: String, required: true },
  description: { type: String },
  permissions: [{ type: String }],
  category: { type: String, enum: ROLE_CATEGORIES, default: 'employee' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

RoleSchema.plugin(tenantPlugin);
RoleSchema.plugin(auditPlugin);

export const Role = mongoose.model<IRole>('Role', RoleSchema);

/**
 * Resolves the effective dashboard/sidebar persona for a role. Falls back to
 * `company_admin` for any wildcard-permission role even if `category` was never
 * set — covers roles created before `category` existed (e.g. the auto-provisioned
 * "Company Admin" role from before this fix), without needing a DB migration.
 */
export const resolveRoleCategory = (role: { category?: string; permissions?: string[] } | null | undefined): RoleCategory => {
  // Wildcard permission wins even over a stored category — a role with '*' is the
  // tenant's all-powerful role by definition, regardless of when `category` was added.
  if (role?.permissions?.includes('*') || role?.permissions?.includes('SUPER_ADMIN')) {
    return 'company_admin';
  }
  if (role?.category && (ROLE_CATEGORIES as readonly string[]).includes(role.category)) {
    return role.category as RoleCategory;
  }
  return 'employee';
};

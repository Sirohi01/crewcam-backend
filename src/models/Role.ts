import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

// How much of the company's data a role can see — a pure data-breadth hierarchy, separate
// from the role's actual job title (Role.name, e.g. "HR Recruiter") and from which login
// screen it uses (loginType). Ordered narrowest to broadest; SCOPE_RANK below encodes that
// order so "can this scope see something that requires at least department-level access"
// is a single numeric comparison instead of a bespoke check per pair of levels.
export const ROLE_SCOPES = ['self', 'team', 'department', 'branch', 'company'] as const;
export type RoleScope = typeof ROLE_SCOPES[number];

export const SCOPE_RANK: Record<RoleScope, number> = {
  self: 0,
  team: 1,
  department: 2,
  branch: 3,
  company: 4,
};

// Which of the two company-portal login screens this role signs in through. Deliberately
// separate from `scope` (which drives data access) and from `name` (the role's actual job
// title) — loginType only ever gates Employer Login vs Employee Login.
export const ROLE_LOGIN_TYPES = ['employer', 'employee'] as const;
export type RoleLoginType = typeof ROLE_LOGIN_TYPES[number];

export interface IRole extends ITenantScoped, IAuditable {
  name: string;
  description: string;
  permissions: string[];
  scope: RoleScope;
  loginType: RoleLoginType;
  isActive: boolean;
}

const RoleSchema = new Schema<IRole>({
  name: { type: String, required: true },
  description: { type: String },
  permissions: [{ type: String }],
  scope: { type: String, enum: ROLE_SCOPES, default: 'self' },
  loginType: { type: String, enum: ROLE_LOGIN_TYPES, default: 'employee' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

RoleSchema.plugin(tenantPlugin);
RoleSchema.plugin(auditPlugin);

export const Role = mongoose.model<IRole>('Role', RoleSchema);

/**
 * Resolves a role's effective data-access scope. Falls back to `company` for any
 * wildcard-permission role even if `scope` was never set — covers roles created before
 * `scope` existed (e.g. the auto-provisioned "Company Admin" role), without a DB migration.
 */
export const resolveRoleScope = (role: { scope?: string; permissions?: string[] } | null | undefined): RoleScope => {
  // Wildcard permission wins even over a stored scope — a role with '*' is the tenant's
  // all-powerful role by definition, regardless of when `scope` was added.
  if (role?.permissions?.includes('*') || role?.permissions?.includes('SUPER_ADMIN')) {
    return 'company';
  }
  if (role?.scope && (ROLE_SCOPES as readonly string[]).includes(role.scope)) {
    return role.scope as RoleScope;
  }
  return 'self';
};

/**
 * Resolves which login screen a role belongs to. Same wildcard-permission fallback as
 * resolveRoleScope — covers roles created before `loginType` existed.
 */
export const resolveRoleLoginType = (role: { loginType?: string; permissions?: string[] } | null | undefined): RoleLoginType => {
  if (role?.permissions?.includes('*') || role?.permissions?.includes('SUPER_ADMIN')) {
    return 'employer';
  }
  if (role?.loginType && (ROLE_LOGIN_TYPES as readonly string[]).includes(role.loginType)) {
    return role.loginType as RoleLoginType;
  }
  return 'employee';
};

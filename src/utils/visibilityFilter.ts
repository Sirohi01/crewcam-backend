import { Tenant } from '../models/Tenant';
import { RoleScope, SCOPE_RANK } from '../models/Role';

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

export const getTenantFeatures = async (tenantId: string): Promise<string[]> => {
  const tenant = await Tenant.findById(tenantId).populate('packageId').lean();
  const pkg: any = (tenant as any)?.packageId;
  if (!pkg || !pkg.isActive) return [];
  return pkg.features || [];
};

export interface VisibilityContext {
  roleId?: string | undefined;
  effectivePermissions: string[];
  tenantFeatures: string[];
}

export interface VisibilityGated {
  requiredPermission?: string;
  requiredFeature?: string;
  // Opt-in fine-grained targeting — e.g. this tenant's specific "HR Recruiter" role, not
  // every role. Ids as strings for easy comparison regardless of whether they arrive as
  // ObjectId or string from Mongoose.
  roleIds?: Array<string | { toString(): string }>;
}

/**
 * Any role with full ('*'/'SUPER_ADMIN') permissions bypasses every other gate below — per
 * explicit product decision, the tenant's top role always sees everything the platform can
 * do. Package-tier feature gating (`requiredFeature`) still applies — that's a billing rule.
 */
const hasFullAccess = (effectivePermissions: string[]) =>
  effectivePermissions.includes('*') || effectivePermissions.includes('SUPER_ADMIN');

export const isVisible = (item: VisibilityGated, ctx: VisibilityContext): boolean => {
  const bypass = hasFullAccess(ctx.effectivePermissions);

  if (!bypass && item.roleIds && item.roleIds.length > 0) {
    const allowedIds = item.roleIds.map((id) => id.toString());
    if (!ctx.roleId || !allowedIds.includes(ctx.roleId)) return false;
  }

  if (!bypass && item.requiredPermission) {
    const hasPermission = hasFullAccess(ctx.effectivePermissions) || ctx.effectivePermissions.includes(item.requiredPermission);
    if (!hasPermission) return false;
  }

  if (item.requiredFeature) {
    const features = ctx.tenantFeatures.map(normalize);
    const hasFeature = features.includes('*') || features.includes(normalize(item.requiredFeature));
    if (!hasFeature) return false;
  }

  return true;
};

export interface WidgetVisibilityContext {
  scope: RoleScope;
  roleId?: string | undefined;
}

export interface WidgetVisibilityGated {
  minScope: string;
  roleIds?: Array<string | { toString(): string }>;
}

/**
 * A widget is visible if the viewer's data scope meets the widget's minimum threshold
 * (self < team < department < branch < company), OR their specific role was individually
 * opted in via roleIds regardless of scope — see DashboardWidgetConfig for why both exist.
 */
export const isWidgetVisible = (item: WidgetVisibilityGated, ctx: WidgetVisibilityContext): boolean => {
  const minRank = SCOPE_RANK[item.minScope as RoleScope] ?? SCOPE_RANK.self;
  if (SCOPE_RANK[ctx.scope] >= minRank) return true;
  if (ctx.roleId && item.roleIds?.some((id) => id.toString() === ctx.roleId)) return true;
  return false;
};

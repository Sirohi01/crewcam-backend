import { Tenant } from '../models/Tenant';

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

export const getTenantFeatures = async (tenantId: string): Promise<string[]> => {
  const tenant = await Tenant.findById(tenantId).populate('packageId').lean();
  const pkg: any = (tenant as any)?.packageId;
  if (!pkg || !pkg.isActive) return [];
  return pkg.features || [];
};

export interface VisibilityContext {
  category: string;
  effectivePermissions: string[];
  tenantFeatures: string[];
}

export interface VisibilityGated {
  requiredPermission?: string;
  requiredFeature?: string;
  categories?: string[];
}

/**
 * Company Admin is the role that bootstraps/owns the company — per explicit product
 * decision, they see every sidebar item regardless of `categories`/`requiredPermission`
 * so they always have full visibility into what the platform can do. Package-tier
 * feature gating (`requiredFeature`) still applies — that's a billing rule, not a role rule.
 */
const SEES_EVERYTHING: VisibilityContext['category'][] = ['company_admin'];

export const isVisible = (item: VisibilityGated, ctx: VisibilityContext): boolean => {
  const bypass = SEES_EVERYTHING.includes(ctx.category);

  if (!bypass && item.categories && item.categories.length > 0 && !item.categories.includes(ctx.category)) {
    return false;
  }

  if (!bypass && item.requiredPermission) {
    const hasPermission =
      ctx.effectivePermissions.includes('*') ||
      ctx.effectivePermissions.includes('SUPER_ADMIN') ||
      ctx.effectivePermissions.includes(item.requiredPermission);
    if (!hasPermission) return false;
  }

  if (item.requiredFeature) {
    const features = ctx.tenantFeatures.map(normalize);
    const hasFeature = features.includes('*') || features.includes(normalize(item.requiredFeature));
    if (!hasFeature) return false;
  }

  return true;
};

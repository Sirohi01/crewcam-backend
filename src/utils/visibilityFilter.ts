import { Tenant } from '../models/Tenant';
import { Company } from '../models/Company';
import { RoleScope, SCOPE_RANK } from '../models/Role';
import { expandFeatureEntries, FEATURE_SECTIONS, normalizeFeatureKey as normalize } from './featureKeys';

const MODULE_MAP: Record<string, string> = {
  'employeemgmt': 'employee',
  'attendance': 'attendance',
  'leavemgmt': 'leave',
  'payroll': 'payroll',
  'performance': 'performance',
  'recruitment': 'recruitment',
  'training': 'training',
  'assets': 'assets',
  'documents': 'documents',
  'helpdesk': 'helpdesk',
  'expense': 'expense',
  'mobile': 'mobile',
};

const MODULE_TO_SECTIONS: Record<string, string[]> = {
  'employee-mgmt': ['People', 'HR & Admin Department'],
  'attendance-mgmt': ['Attendance Section'],
  'leave-mgmt': ['Attendance Section'],
  'payroll-mgmt': ['Payroll'],
  'performance-mgmt': ['PMS System'],
  'recruitment': ['Hiring Process'],
  'document-mgmt': ['Communications'],
  'helpdesk': ['Support & Operations', 'Meeting Section'],
};

export const getTenantFeatures = async (tenantId: string): Promise<{ features: string[], allowedSections: string[] }> => {
  if (tenantId === 'SUPER_ADMIN') return { features: ['*'], allowedSections: [] };
  
  const [tenant, company] = await Promise.all([
    Tenant.findById(tenantId).populate('packageId').lean(),
    Company.findOne({ tenantId }).select('selectedModules addonModules').lean()
  ]);
  
  const pkg: any = (tenant as any)?.packageId;
  let allowedSections = (tenant as any)?.allowedSections || [];
  
  // Also derive allowedSections from configured modules
  const tenantModules = (tenant as any)?.modules;
  if (tenantModules && Array.isArray(tenantModules)) {
    const derivedSections = new Set<string>();
    tenantModules.filter((m: any) => m.enabled).forEach((m: any) => {
      const secs = MODULE_TO_SECTIONS[m.key];
      if (secs) secs.forEach(s => derivedSections.add(s));
    });
    if (derivedSections.size > 0) {
      allowedSections = Array.from(new Set([...allowedSections, ...Array.from(derivedSections), 'Workspace', 'Company Setup','Organization Setup', 'Admin Section']));
    }
  }

  if (!pkg || !pkg.isActive) return { features: [], allowedSections };
  
  // The v2 plan builder stores catalogue IDs; expand them to module names/codes.
  let features: string[] = await expandFeatureEntries(pkg.features);
  
  if (company && company.selectedModules && company.selectedModules.length > 0) {
    features = features.filter((f: string) => {
      const normF = normalize(f);
      const modKey = MODULE_MAP[normF];
      if (modKey) {
        return company.selectedModules!.includes(modKey);
      }
      return true;
    });
  }
  
  // Add-ons bought on the package or switched on for the company. requireFeature()
  // has always honoured these; the sidebar now does too, so the two agree.
  const addOns = [
    ...(await expandFeatureEntries(pkg.addOnModules)),
    ...(await expandFeatureEntries((company as any)?.addonModules)),
    ...((tenantModules || []) as any[]).filter((m) => m.enabled && m.key).map((m) => String(m.key)),
  ];
  features = Array.from(new Set([...features, ...addOns]));

  // An add-on's own sidebar section must survive an allowedSections restriction.
  if (allowedSections.length > 0) {
    const addOnSections = features.flatMap((f) => FEATURE_SECTIONS[normalize(f)] || []);
    allowedSections = Array.from(new Set([...allowedSections, ...addOnSections]));
  }

  return { features, allowedSections };
};

export interface VisibilityContext {
  roleId?: string | undefined;
  effectivePermissions: string[];
  tenantFeatures: string[];
  allowedSections?: string[];
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

export const isVisible = (item: VisibilityGated & { label?: string, section?: string }, ctx: VisibilityContext): boolean => {
  const bypass = hasFullAccess(ctx.effectivePermissions);

  if (ctx.allowedSections && ctx.allowedSections.length > 0) {
    // If the tenant has specific allowed sections, filter by section
    if (item.section && item.section !== 'Workspace' && !ctx.allowedSections.includes(item.section)) {
      return false;
    }
  }

  if (!bypass && item.roleIds && item.roleIds.length > 0) {
    const allowedIds = item.roleIds.map((id) => id.toString());
    if (!ctx.roleId || !allowedIds.includes(ctx.roleId)) return false;
  }

  if (!bypass) {
    let reqPerm = item.requiredPermission;
    // Fallback: if no explicit permission is required, assume it requires its label's auto-generated permission.
    // (This matches the Role Rights page behavior and prevents custom modules like Business Unit from leaking globally).
    if (!reqPerm && item.label && item.label !== 'Dashboard') {
      reqPerm = `${item.label.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_READ`;
    }

    if (reqPerm) {
      const hasPermission = hasFullAccess(ctx.effectivePermissions) || ctx.effectivePermissions.includes(reqPerm);
      if (!hasPermission) return false;
    }
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

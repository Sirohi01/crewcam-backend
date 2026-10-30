import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { Role, resolveRoleScope, resolveRoleLoginType } from '../models/Role';
import { EmployeePermissionOverride } from '../models/EmployeePermissionOverride';
import { SidebarConfig } from '../models/SidebarConfig';
import { DashboardWidgetConfig } from '../models/DashboardWidgetConfig';
import { AuditLog } from '../models/AuditLog';
import { getEffectivePermissions } from '../middleware/rbac';
import { getTenantFeatures, isVisible } from '../utils/visibilityFilter';
import { syncSidebarDefaults, syncDashboardWidgetDefaults } from '../utils/seedSync';

/**
 * The real, in-use permission-string catalog, grepped from every route file's
 * checkPermission(...) calls — see docs/03_ROLES_DASHBOARDS_PERMISSIONS.md / Phase H plan.
 * 'ROLE_ADMIN' is new, gating this controller's own endpoints.
 */
const PERMISSION_CATALOG = [
  { name: 'EMPLOYEE_READ', module: 'Employees' },
  { name: 'EMPLOYEE_WRITE', module: 'Employees' },
  { name: 'COMPANY_PROFILE_READ', module: 'Company' },
  { name: 'COMPANY_PROFILE_WRITE', module: 'Company' },
  { name: 'ORG_READ', module: 'Organization' },
  { name: 'ORG_WRITE', module: 'Organization' },
  { name: 'MASTER_READ', module: 'Master Data' },
  { name: 'MASTER_WRITE', module: 'Master Data' },
  { name: 'FINANCE_READ', module: 'Finance' },
  { name: 'FINANCE_WRITE', module: 'Finance' },
  { name: 'SUPPORT_READ', module: 'Support' },
  { name: 'SUPPORT_WRITE', module: 'Support' },
  { name: 'ATS_READ', module: 'Hiring & ATS' },
  { name: 'ATS_WRITE', module: 'Hiring & ATS' },
  { name: 'RECRUITMENT_APPROVE', module: 'Hiring & ATS' },
  { name: 'ROLE_ADMIN', module: 'Platform Admin' },
  // Employer-side (Owner/Director/CFO/...) concepts with no dedicated page/route yet — kept
  // in the catalog so they can already be assigned to a role, but nothing enforces them
  // server-side until the corresponding Subscription/Billing/Payroll-approval routes exist.
  { name: 'SUBSCRIPTION_READ', module: 'Subscription & Billing' },
  { name: 'SUBSCRIPTION_WRITE', module: 'Subscription & Billing' },
  { name: 'BILLING_READ', module: 'Subscription & Billing' },
  { name: 'BILLING_WRITE', module: 'Subscription & Billing' },
  { name: 'PAYROLL_APPROVE', module: 'Payroll' },
  { name: 'REPORTS_READ', module: 'Reports' },
];

export const getPermissionCatalog = async (_req: AuthRequest, res: Response) => {
  res.status(200).json(PERMISSION_CATALOG);
};

const computeEffective = (rolePermissions: string[], override: any): string[] => {
  const effective = new Set<string>(rolePermissions || []);
  if (override && (!override.expiresAt || new Date(override.expiresAt) > new Date())) {
    (override.grants || []).forEach((p: string) => effective.add(p));
    (override.revokes || []).forEach((p: string) => effective.delete(p));
  }
  return Array.from(effective);
};

export const getEffectivePermissionsForUser = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { userId } = req.params;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const targetUser = await User.findOne({ _id: userId, tenantId } as any).populate('roleId');
    if (!targetUser) return res.status(404).json({ message: 'Employee not found' });

    const role: any = targetUser.roleId;
    const override = await EmployeePermissionOverride.findOne({ tenantId, userId } as any);

    res.status(200).json({
      userId,
      roleName: role?.name || null,
      roleScope: resolveRoleScope(role),
      rolePermissions: role?.permissions || [],
      override: override ? { grants: override.grants, revokes: override.revokes, reason: override.reason, expiresAt: override.expiresAt } : null,
      effectivePermissions: computeEffective(role?.permissions || [], override),
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching effective permissions' });
  }
};

export const upsertPermissionOverride = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { userId } = req.params;
    const { grants = [], revokes = [], reason, expiresAt } = req.body;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    if (!reason) return res.status(400).json({ message: 'A reason is required to change an employee permission override' });

    const targetUser = await User.findOne({ _id: userId, tenantId } as any);
    if (!targetUser) return res.status(404).json({ message: 'Employee not found' });

    const override = await EmployeePermissionOverride.findOneAndUpdate(
      { tenantId, userId } as any,
      { tenantId, userId, grants, revokes, reason, grantedBy: String(req.user!._id), expiresAt: expiresAt || undefined },
      { upsert: true, returnDocument: 'after' }
    );

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'UPDATE_PERMISSION_OVERRIDE',
      module: 'Platform Admin',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      details: { targetUserId: userId, grants, revokes, reason },
    });

    res.status(200).json({ message: 'Permission override updated', override });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating permission override' });
  }
};

export const getSidebarConfig = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    await syncSidebarDefaults(tenantId);
    const items = await SidebarConfig.find({ tenantId }).populate('roleIds', 'name').sort({ sectionOrder: 1, order: 1 });
    res.status(200).json(items);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching sidebar configuration' });
  }
};

export const createSidebarConfigItem = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const { section, sectionOrder, label, href, icon, order, parent, requiredPermission, requiredFeature, roleIds, isActive } = req.body;
    
    const item = await SidebarConfig.create({
      tenantId,
      section,
      sectionOrder,
      label,
      href,
      icon,
      order,
      parent,
      requiredPermission,
      requiredFeature,
      roleIds,
      isActive
    });

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'CREATE_SIDEBAR_CONFIG',
      module: 'Platform Admin',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      details: { itemId: item._id },
    });

    res.status(201).json(item);
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating sidebar item' });
  }
};

// Fields safe to fan out to every tenant's own copy of a sidebar item. roleIds is
// deliberately excluded — it holds Role ObjectIds from the SUPER_ADMIN pseudo-tenant, which
// don't correspond to any real role in another tenant, so copying it would silently break
// role-based visibility there instead of just toggling the item on/off.
const GLOBAL_PROPAGATABLE_SIDEBAR_FIELDS = [
  'isActive', 'label', 'href', 'icon', 'order', 'parent', 'section', 'sectionOrder',
  'requiredPermission', 'requiredFeature', 'itemType',
] as const;

export const updateSidebarConfigItem = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.tenantId;

    const item = await SidebarConfig.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { $set: updateData },
      { returnDocument: 'after' }
    );
    if (!item) return res.status(404).json({ message: 'Sidebar item not found' });

    // The Super Admin's Sidebar Management page is the global template editor — every other
    // tenant has its own separate SidebarConfig documents (seeded per-tenant from
    // DEFAULT_SIDEBAR_ITEMS), so without this an edit made here — e.g. disabling an item —
    // only ever touched the SUPER_ADMIN pseudo-tenant's own copy and never reached anyone
    // else's sidebar. Match the same logical item (section+label, plus href for real links)
    // across every tenant and apply the same safe fields there.
    let propagatedCount = 0;
    if (tenantId === 'SUPER_ADMIN') {
      const propagateFields: Record<string, any> = {};
      for (const key of GLOBAL_PROPAGATABLE_SIDEBAR_FIELDS) {
        if (key in updateData) propagateFields[key] = updateData[key];
      }
      if (Object.keys(propagateFields).length > 0) {
        const matchQuery: Record<string, any> = {
          tenantId: { $ne: 'SUPER_ADMIN' },
          section: item.section,
          label: item.label,
        };
        if (item.href) matchQuery.href = item.href;
        const result = await SidebarConfig.updateMany(matchQuery as any, { $set: propagateFields });
        propagatedCount = result.modifiedCount || 0;
      }
    }

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'UPDATE_SIDEBAR_CONFIG',
      module: 'Platform Admin',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      details: { itemId: id, propagatedToTenants: propagatedCount },
    });

    res.status(200).json(item);
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating sidebar item' });
  }
};

export const deleteSidebarConfigItem = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const item = await SidebarConfig.findOneAndDelete({ _id: id, tenantId } as any);
    if (!item) return res.status(404).json({ message: 'Sidebar item not found' });

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'DELETE_SIDEBAR_CONFIG',
      module: 'Platform Admin',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      details: { itemId: id, label: item.label },
    });

    res.status(200).json({ message: 'Sidebar item deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting sidebar item' });
  }
};

/**
 * Returns the sidebar items the CURRENT user should see — filtered by their effective
 * permissions, their specific role (roleIds opt-in), and the tenant's enabled features.
 * Unlike getSidebarConfig (admin-only, full unfiltered list for editing), this is
 * what the actual app sidebar renders, so it's open to any authenticated user.
 */
export const getMySidebar = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    await syncSidebarDefaults(tenantId);
    const items = await SidebarConfig.find({ tenantId, isActive: true }).sort({ sectionOrder: 1, order: 1 });

    const role: any = await Role.findOne({ _id: req.user.roleId, tenantId } as any);
    const [effectivePermissions, tenantData] = await Promise.all([
      getEffectivePermissions(req),
      getTenantFeatures(tenantId),
    ]);

    const ctx = {
      roleId: req.user.roleId ? String(req.user.roleId) : undefined,
      effectivePermissions,
      tenantFeatures: tenantData.features,
      allowedSections: tenantData.allowedSections,
    };
    const visible = items.filter((item) => isVisible(item, ctx));
    const loginType = resolveRoleLoginType(role);
    const roleScope = resolveRoleScope(role);

    // If the user's role is employee, ensure company admin sections are not accessible/visible
    const ADMIN_EXCLUSIVE_SECTIONS = new Set([
      'Organization Setup',
      'Company Setup',
      'Sidebar Section',
      'Admin Section',
      'Admin UI',
    ]);

    const filteredVisible = loginType === 'employer'
      ? visible
      : visible.filter((item: any) => !ADMIN_EXCLUSIVE_SECTIONS.has(item.section));

    res.status(200).json({ items: filteredVisible, roleScope, loginType });
  } catch (error: any) {
    console.error('getMySidebar error:', error);
    res.status(500).json({ message: 'Error fetching sidebar' });
  }
};

export const getDashboardWidgetConfig = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    await syncDashboardWidgetDefaults(tenantId);
    const widgets = await DashboardWidgetConfig.find({ tenantId }).populate('roleIds', 'name').sort({ order: 1 });
    res.status(200).json(widgets);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching dashboard widget configuration' });
  }
};

export const updateDashboardWidgetConfigItem = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const { order, minScope, roleIds, isActive } = req.body;
    const item = await DashboardWidgetConfig.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { order, minScope, roleIds, isActive },
      { returnDocument: 'after', runValidators: true }
    );
    if (!item) return res.status(404).json({ message: 'Widget not found' });

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'UPDATE_DASHBOARD_WIDGET_CONFIG',
      module: 'Platform Admin',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      details: { itemId: id },
    });

    res.status(200).json(item);
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating dashboard widget' });
  }
};

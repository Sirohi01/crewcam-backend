import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { Role, resolveRoleCategory } from '../models/Role';
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
  { name: 'ROLE_ADMIN', module: 'Platform Admin' },
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
      roleCategory: resolveRoleCategory(role),
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
    const items = await SidebarConfig.find({ tenantId }).sort({ sectionOrder: 1, order: 1 });
    res.status(200).json(items);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching sidebar configuration' });
  }
};

export const updateSidebarConfigItem = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const { label, order, requiredPermission, requiredFeature, categories, isActive } = req.body;
    const item = await SidebarConfig.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { label, order, requiredPermission, requiredFeature, categories, isActive },
      { returnDocument: 'after' }
    );
    if (!item) return res.status(404).json({ message: 'Sidebar item not found' });

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'UPDATE_SIDEBAR_CONFIG',
      module: 'Platform Admin',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      details: { itemId: id },
    });

    res.status(200).json(item);
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating sidebar item' });
  }
};

/**
 * Returns the sidebar items the CURRENT user should see — filtered by their
 * effective permissions, their role's category, and the tenant's enabled features.
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
    const [effectivePermissions, tenantFeatures] = await Promise.all([
      getEffectivePermissions(req),
      getTenantFeatures(tenantId),
    ]);

    const ctx = { category: resolveRoleCategory(role), effectivePermissions, tenantFeatures };
    const visible = items.filter((item) => isVisible(item, ctx));

    res.status(200).json(visible);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching sidebar' });
  }
};

export const getDashboardWidgetConfig = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    await syncDashboardWidgetDefaults(tenantId);
    const widgets = await DashboardWidgetConfig.find({ tenantId }).sort({ category: 1, order: 1 });
    res.status(200).json(widgets);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching dashboard widget configuration' });
  }
};

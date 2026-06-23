import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { Role } from '../models/Role'; // Explicit import to prevent optimization
import { EmployeePermissionOverride } from '../models/EmployeePermissionOverride';

/**
 * Effective permissions = role.permissions, plus any non-expired per-employee
 * grants, minus any non-expired per-employee revokes (docs/03_ROLES_DASHBOARDS_PERMISSIONS.md §3).
 */
export const getEffectivePermissions = async (req: AuthRequest): Promise<string[]> => {
  if (!req.user || !req.user.roleId) return [];

  const userWithRole = await req.user.populate<{ roleId: any }>({
    path: 'roleId',
    options: { bypassTenantIsolation: true },
  });

  if (!userWithRole.roleId || !userWithRole.roleId.isActive) return [];

  const effective = new Set<string>(userWithRole.roleId.permissions || []);

  const tenantId = req.tenantId || req.user.tenantId;
  const override = await EmployeePermissionOverride.findOne({ tenantId, userId: req.user._id }).setOptions({
    bypassTenantIsolation: true,
  });

  if (override && (!override.expiresAt || override.expiresAt > new Date())) {
    (override.grants || []).forEach((p) => effective.add(p));
    (override.revokes || []).forEach((p) => effective.delete(p));
  }

  return Array.from(effective);
};

export const checkPermission = (requiredPermission: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user || !req.user.roleId) {
        return res.status(403).json({ message: 'Access denied: No role assigned' });
      }
      if (!Role) throw new Error('Role model not loaded');

      const permissions = await getEffectivePermissions(req);

      if (permissions.length === 0) {
        return res.status(403).json({ message: 'Access denied: Role is inactive or missing' });
      }

      // Super admin override (if we have a special permission string for super admins)
      if (permissions.includes('*') || permissions.includes('SUPER_ADMIN')) {
        return next();
      }

      if (permissions.includes(requiredPermission)) {
        return next();
      }

      return res.status(403).json({ message: `Access denied: Requires ${requiredPermission} permission` });
    } catch (error: any) {
      console.error('RBAC Error:', error);
      res.status(500).json({ message: 'Internal server error during permission check' });
    }
  };
};

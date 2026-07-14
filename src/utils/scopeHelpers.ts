import { AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { RoleScope } from '../models/Role';

/**
 * Filter for "my direct reports" queries (Reporting Manager / Team Leader persona).
 * Relies on User.reportingToId, which already exists on the schema.
 */
export const getTeamFilter = (req: AuthRequest) => {
  const tenantId = req.tenantId || req.user?.tenantId;
  return { tenantId, reportingToId: req.user?._id };
};

export const getDepartmentFilter = (req: AuthRequest) => {
  const tenantId = req.tenantId || req.user?.tenantId;
  return { tenantId, departmentId: req.user?.departmentId };
};

export const getBranchFilter = (req: AuthRequest) => {
  const tenantId = req.tenantId || req.user?.tenantId;
  return { tenantId, branchId: req.user?.branchId };
};

export const getUserScopeFilter = async (
  req: AuthRequest,
  scope: RoleScope
): Promise<Record<string, any>> => {
  const tenantId = req.tenantId || req.user?.tenantId;

  if (scope === 'company') {
    return { tenantId };
  }

  if (scope === 'branch') {
    const branchUsers = await User.find({ tenantId, branchId: req.user?.branchId } as any).select('_id');
    return { tenantId, userId: { $in: [req.user?._id, ...branchUsers.map((u) => u._id)] } };
  }

  if (scope === 'department') {
    const deptUsers = await User.find({ tenantId, departmentId: req.user?.departmentId } as any).select('_id');
    return { tenantId, userId: { $in: [req.user?._id, ...deptUsers.map((u) => u._id)] } };
  }

  if (scope === 'team') {
    const directReports = await User.find({ tenantId, reportingToId: req.user?._id } as any).select('_id');
    return { tenantId, userId: { $in: [req.user?._id, ...directReports.map((u) => u._id)] } };
  }

  // 'self' or anything unrecognized: self only.
  return { tenantId, userId: req.user?._id };
};

/**
 * Boolean check for a single-employee drill-down (e.g. Individual Attendance):
 * is `targetUserId` within the caller's scope-limited visibility?
 */
export const canAccessUser = async (
  req: AuthRequest,
  scope: RoleScope,
  targetUserId: string
): Promise<boolean> => {
  if (String(req.user?._id) === String(targetUserId)) return true;
  if (scope === 'company') return true;

  const tenantId = req.tenantId || req.user?.tenantId;
  const target = await User.findOne({ _id: targetUserId, tenantId } as any).select('reportingToId departmentId branchId');
  if (!target) return false;

  if (scope === 'branch') {
    return String(target.branchId) === String(req.user?.branchId);
  }
  if (scope === 'department') {
    return String(target.departmentId) === String(req.user?.departmentId);
  }
  if (scope === 'team') {
    return String(target.reportingToId) === String(req.user?._id);
  }
  return false;
};

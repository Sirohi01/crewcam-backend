import { AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { RoleCategory } from '../models/Role';

/**
 * Filter for "my direct reports" queries (Reporting Manager persona).
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

const ORG_WIDE_CATEGORIES: RoleCategory[] = ['hr', 'hr_admin', 'admin', 'company_admin', 'finance'];

export const getUserScopeFilter = async (
  req: AuthRequest,
  category: RoleCategory
): Promise<Record<string, any>> => {
  const tenantId = req.tenantId || req.user?.tenantId;

  if (ORG_WIDE_CATEGORIES.includes(category)) {
    return { tenantId };
  }

  if (category === 'reporting_manager') {
    const directReports = await User.find({ tenantId, reportingToId: req.user?._id } as any).select('_id');
    return { tenantId, userId: { $in: [req.user?._id, ...directReports.map((u) => u._id)] } };
  }

  if (category === 'hod') {
    const deptUsers = await User.find({ tenantId, departmentId: req.user?.departmentId } as any).select('_id');
    return { tenantId, userId: { $in: [req.user?._id, ...deptUsers.map((u) => u._id)] } };
  }

  // employee / developer / anything unrecognized: self only.
  return { tenantId, userId: req.user?._id };
};

/**
 * Boolean check for a single-employee drill-down (e.g. Individual Attendance):
 * is `targetUserId` within the caller's persona-scoped visibility?
 */
export const canAccessUser = async (
  req: AuthRequest,
  category: RoleCategory,
  targetUserId: string
): Promise<boolean> => {
  if (String(req.user?._id) === String(targetUserId)) return true;
  if (ORG_WIDE_CATEGORIES.includes(category)) return true;

  const tenantId = req.tenantId || req.user?.tenantId;
  const target = await User.findOne({ _id: targetUserId, tenantId } as any).select('reportingToId departmentId');
  if (!target) return false;

  if (category === 'reporting_manager') {
    return String(target.reportingToId) === String(req.user?._id);
  }
  if (category === 'hod') {
    return String(target.departmentId) === String(req.user?.departmentId);
  }
  return false;
};

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { Branch } from '../models/Branch';
import { Role, resolveRoleCategory } from '../models/Role';
import { LeaveRequest } from '../models/LeaveRequest';
import { Attendance } from '../models/Attendance';
import { Candidate } from '../models/Candidate';
import { Meeting } from '../models/Meeting';
import { DisciplinaryAction } from '../models/DisciplinaryAction';
import { Agreement } from '../models/Agreement';
import { Package } from '../models/Package';
import { Tenant } from '../models/Tenant';
import { DashboardWidgetConfig } from '../models/DashboardWidgetConfig';
import { getEffectivePermissions } from '../middleware/rbac';
import { getTeamFilter, getDepartmentFilter } from '../utils/scopeHelpers';
import { syncDashboardWidgetDefaults } from '../utils/seedSync';

/** Legacy stats endpoint, kept for backward compatibility with anything still calling it. */
export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const totalEmployees = await User.countDocuments({ tenantId, isActive: true });
    const activeBranches = await Branch.countDocuments({ tenantId, isActive: true });
    const pendingLeaveRequests = await LeaveRequest.countDocuments({ tenantId, status: 'Pending' });
    const payrollExpense = 0; // Real payroll aggregation lands with Phase L (Accounts).

    res.status(200).json({ totalEmployees, activeBranches, pendingLeaveRequests, payrollExpense });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching stats' });
  }
};

/**
 * Returns the current user's persona category, effective permissions, and the
 * ordered widget-key list their dashboard should render — one call instead of
 * the frontend needing several round-trips before it can paint anything.
 */
export const getDashboardConfig = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const role: any = await Role.findOne({ _id: req.user.roleId, tenantId } as any);
    const category = resolveRoleCategory(role);

    await syncDashboardWidgetDefaults(tenantId);
    const widgets = await DashboardWidgetConfig.find({ tenantId, isActive: true }).sort({ category: 1, order: 1 });

    const widgetKeys = widgets
      .filter((w) => w.category === category)
      .sort((a, b) => a.order - b.order)
      .map((w) => w.widgetKey);

    const effectivePermissions = await getEffectivePermissions(req);

    res.status(200).json({ category, effectivePermissions, widgets: widgetKeys });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching dashboard configuration' });
  }
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Dispatches to the real query behind one widget key. Finance widgets that depend
 * on Accounts/Obligations models not built yet (Phase L) return a real zero with
 * a `dataAvailable: false` flag instead of fabricated numbers.
 */
export const getWidgetData = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { widgetKey } = req.params;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const role: any = await Role.findOne({ _id: req.user.roleId, tenantId } as any);
    const category = resolveRoleCategory(role);

    switch (widgetKey) {
      case 'my-attendance-today': {
        const record = await Attendance.findOne({ tenantId, userId: req.user._id, date: { $gte: startOfToday() } });
        return res.status(200).json({ status: record?.status || 'Not Clocked In' });
      }

      case 'my-leave-balance': {
        const pending = await LeaveRequest.countDocuments({ tenantId, userId: req.user._id, status: 'Pending' });
        const approved = await LeaveRequest.countDocuments({ tenantId, userId: req.user._id, status: 'Approved' });
        return res.status(200).json({ pending, approvedThisYear: approved });
      }

      case 'my-todo': {
        // No Todo model exists yet (lands with Phase I) — wire the slot, don't fabricate data.
        return res.status(200).json({ dataAvailable: false, items: [] });
      }

      case 'team-attendance-today':
      case 'department-attendance': {
        const memberFilter = widgetKey === 'team-attendance-today' ? getTeamFilter(req) : getDepartmentFilter(req);
        const memberIds = await User.find(memberFilter as any).distinct('_id');
        const present = await Attendance.countDocuments({
          tenantId,
          userId: { $in: memberIds },
          date: { $gte: startOfToday() },
          status: 'Present',
        });
        return res.status(200).json({ teamSize: memberIds.length, presentToday: present });
      }

      case 'department-headcount': {
        const count = await User.countDocuments({ ...getDepartmentFilter(req), isActive: true } as any);
        return res.status(200).json({ count });
      }

      case 'pending-approvals': {
        const memberFilter = category === 'hod' ? getDepartmentFilter(req) : getTeamFilter(req);
        const memberIds = await User.find(memberFilter as any).distinct('_id');
        const pending = await LeaveRequest.countDocuments({ tenantId, userId: { $in: memberIds }, status: 'Pending' });
        return res.status(200).json({ pending });
      }

      case 'org-headcount': {
        const count = await User.countDocuments({ tenantId, isActive: true });
        return res.status(200).json({ count });
      }

      case 'hiring-pipeline-summary': {
        const statuses = ['Applied', 'Screening', 'Interviewing', 'Offered', 'Hired'] as const;
        const counts = await Promise.all(statuses.map((status) => Candidate.countDocuments({ tenantId: tenantId as any, status })));
        return res.status(200).json(Object.fromEntries(statuses.map((s, i) => [s.toLowerCase(), counts[i]])));
      }

      case 'tenant-feature-usage': {
        const tenant = await Tenant.findById(tenantId).populate('packageId').lean();
        const pkg: any = (tenant as any)?.packageId;
        const userCount = await User.countDocuments({ tenantId, isActive: true });
        return res.status(200).json({
          packageName: pkg?.name || null,
          featureCount: pkg?.features?.length || 0,
          users: userCount,
          maxUsers: pkg?.maxUsers ?? null,
        });
      }

      case 'meetings-summary': {
        const scheduled = await Meeting.countDocuments({ tenantId: tenantId as any, status: 'Scheduled' });
        const completed = await Meeting.countDocuments({ tenantId: tenantId as any, status: 'Completed' });
        return res.status(200).json({ scheduled, completed });
      }

      case 'disciplinary-cases-open': {
        const open = await DisciplinaryAction.countDocuments({ tenantId: tenantId as any, status: { $in: ['Draft', 'Issued', 'Appealed'] } });
        return res.status(200).json({ count: open });
      }

      case 'agreements-active': {
        const active = await Agreement.countDocuments({ tenantId: tenantId as any, status: 'Active' });
        return res.status(200).json({ count: active });
      }

      case 'payroll-pending':
      case 'obligations-due':
      case 'exit-formalities-pending':
      case 'pms-appraisal-status':
      case 'master-data-health':
      case 'communications-summary':
      case 'developer-tasks': {
        // Real query lands with this widget's owning phase (see docs/roadmap/) — wire the slot, don't fabricate data.
        return res.status(200).json({ dataAvailable: false });
      }

      default:
        // New widget keys can be added to sidebar/dashboard seed data ahead of their
        // backend query — fail soft instead of 404 so the UI never shows a broken widget.
        return res.status(200).json({ dataAvailable: false });
    }
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching widget data' });
  }
};

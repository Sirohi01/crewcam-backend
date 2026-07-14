import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { LeaveRequest } from '../models/LeaveRequest';
import { LeaveType } from '../models/LeaveType';
import { LeaveCredit } from '../models/LeaveCredit';
import { AuditLog } from '../models/AuditLog';
import { Role, resolveRoleScope } from '../models/Role';
import { canAccessUser } from '../utils/scopeHelpers';
import moment from 'moment';

const daysInclusive = (start: Date, end: Date) => moment(end).diff(moment(start), 'days') + 1;

export const applyLeave = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    
    const { leaveTypeId, startDate, endDate, reason } = req.body;
    
    if (!leaveTypeId || !startDate || !endDate || !reason) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
      return res.status(400).json({ message: 'Start date cannot be after end date' });
    }

    const leaveRequest = await LeaveRequest.create({
      tenantId,
      userId: req.user!._id as any,
      leaveTypeId,
      startDate: start,
      endDate: end,
      reason,
      status: 'Pending'
    } as any);

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'APPLY_LEAVE',
      module: 'Leaves',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string
    } as any);

    res.status(201).json({ message: 'Leave request submitted successfully', leaveRequest });
  } catch (error: any) {
    res.status(500).json({ message: 'Error applying for leave', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getMyLeaves = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const leaves = await LeaveRequest.find({ tenantId, userId: req.user!._id as any } as any)
      .populate('leaveTypeId', 'name')
      .populate('approvedBy', 'firstName lastName')
      .sort({ createdAt: -1 });
      
    res.status(200).json(leaves);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching leaves', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getTenantLeaves = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const leaves = await LeaveRequest.find({ tenantId } as any)
      .populate('userId', 'firstName lastName email')
      .populate('leaveTypeId', 'name')
      .populate('approvedBy', 'firstName lastName')
      .sort({ createdAt: -1 });
      
    res.status(200).json(leaves);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching tenant leaves', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const approveRejectLeave = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const leaveRequest = await LeaveRequest.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { 
        status, 
        approvedBy: req.user!._id as any,
        rejectionReason: status === 'Rejected' ? rejectionReason : undefined
      },
      { returnDocument: 'after' }
    );

    if (!leaveRequest) {
      return res.status(404).json({ message: 'Leave request not found' });
    }

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: status === 'Approved' ? 'APPROVE_LEAVE' : 'REJECT_LEAVE',
      module: 'Leaves',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { leaveRequestId: (leaveRequest as any)._id }
    } as any);

    res.status(200).json({ message: `Leave ${status.toLowerCase()} successfully`, leaveRequest });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating leave status', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

/**
 * Employee Leave Statistics: per leave-type balance (default allotment + manual
 * credits - approved days taken), days pending approval, and days taken this year.
 * Defaults to the caller's own stats; HR/HOD/Reporting Manager can pass `?userId=`
 * for any employee within their persona scope (docs/modules/30_ATTENDANCE_AND_LEAVE.md).
 */
export const getLeaveStatistics = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const targetUserId = (req.query.userId as string) || String(req.user._id);

    if (targetUserId !== String(req.user._id)) {
      const role: any = await Role.findOne({ _id: req.user.roleId, tenantId } as any);
      const scope = resolveRoleScope(role);
      const allowed = await canAccessUser(req, scope, targetUserId);
      if (!allowed) return res.status(403).json({ message: 'Not authorized to view this employee\'s leave statistics' });
    }

    const [leaveTypes, requests, credits] = await Promise.all([
      LeaveType.find({ tenantId, isActive: true } as any),
      LeaveRequest.find({ tenantId, userId: targetUserId } as any),
      LeaveCredit.find({ tenantId, userId: targetUserId } as any),
    ]);

    const yearStart = moment().startOf('year').toDate();

    const stats = leaveTypes.map((type: any) => {
      const typeId = String(type._id);
      const typeRequests = requests.filter((r: any) => String(r.leaveTypeId) === typeId);
      const approved = typeRequests.filter((r: any) => r.status === 'Approved');
      const pending = typeRequests.filter((r: any) => r.status === 'Pending');
      const takenThisYear = approved
        .filter((r: any) => r.startDate >= yearStart)
        .reduce((sum: number, r: any) => sum + daysInclusive(r.startDate, r.endDate), 0);
      const pendingDays = pending.reduce((sum: number, r: any) => sum + daysInclusive(r.startDate, r.endDate), 0);
      const creditedDays = credits
        .filter((c: any) => String(c.leaveTypeId) === typeId)
        .reduce((sum: number, c: any) => sum + c.days, 0);

      return {
        leaveTypeId: type._id,
        leaveTypeName: type.name,
        defaultDays: type.defaultDays,
        creditedDays,
        takenThisYear,
        pendingDays,
        balance: type.defaultDays + creditedDays - takenThisYear,
      };
    });

    res.status(200).json({ userId: targetUserId, stats });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching leave statistics', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

/**
 * Leave Credit: HR manually credits extra leave days to an employee. Mandatory
 * audit entry (who/how much/why) per docs/modules/30_ATTENDANCE_AND_LEAVE.md §4 —
 * same rigor as a financial transaction since it directly affects leave balance.
 */
export const creditLeave = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const { userId, leaveTypeId, days, reason } = req.body;
    if (!userId || !leaveTypeId || !days || !reason) {
      return res.status(400).json({ message: 'userId, leaveTypeId, days, and reason are all required' });
    }
    if (Number(days) <= 0) {
      return res.status(400).json({ message: 'days must be a positive number' });
    }

    const credit = await LeaveCredit.create({
      tenantId,
      userId,
      leaveTypeId,
      days: Number(days),
      reason,
      creditedBy: req.user._id,
    });

    await AuditLog.create({
      tenantId,
      userId: req.user._id,
      action: 'CREDIT_LEAVE',
      module: 'Leaves',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { creditedTo: userId, leaveTypeId, days: Number(days), reason },
    } as any);

    res.status(201).json({ message: 'Leave credited successfully', credit });
  } catch (error: any) {
    res.status(500).json({ message: 'Error crediting leave', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { LeaveRequest } from '../models/LeaveRequest';
import { LeaveType } from '../models/LeaveType';
import { LeaveCredit } from '../models/LeaveCredit';
import { AuditLog } from '../models/AuditLog';
import { Role, resolveRoleScope } from '../models/Role';
import { canAccessUser } from '../utils/scopeHelpers';
import moment from 'moment';
import mongoose from 'mongoose';

import { leaveDays } from '../utils/leaveDays';
import { isOwnUploadUrl } from '../utils/fileStorage';
import { notifyUser } from './communicationController';

export const applyLeave = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    
    const { leaveTypeId, startDate, endDate, reason, isHalfDay, halfDaySession, contactNumber, contactEmail, attachmentUrl } = req.body;
    
    if (!leaveTypeId || !startDate || !endDate || !reason) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid start or end date' });
    }
    if (start > end) {
      return res.status(400).json({ message: 'Start date cannot be after end date' });
    }
    if (String(reason).trim().length > 1000) {
      return res.status(400).json({ message: 'Reason must be 1000 characters or fewer' });
    }
    const halfDay = isHalfDay === true;
    if (halfDay && !moment(start).isSame(end, 'day')) {
      return res.status(400).json({ message: 'A half-day leave must start and end on the same day' });
    }
    if (halfDay && !['first', 'second'].includes(halfDaySession)) {
      return res.status(400).json({ message: 'Choose the first or second half for a half-day leave' });
    }
    if (contactNumber && !/^[+\d][\d\s-]{5,19}$/.test(String(contactNumber))) {
      return res.status(400).json({ message: 'Contact number is not valid' });
    }
    if (contactEmail && !/^\S+@\S+\.\S+$/.test(String(contactEmail))) {
      return res.status(400).json({ message: 'Contact email is not valid' });
    }
    if (attachmentUrl && !isOwnUploadUrl(attachmentUrl)) {
      return res.status(400).json({ message: 'Attachment must be uploaded through the app' });
    }

    // The leave type must be an active type of the caller's own company.
    const leaveType = mongoose.isValidObjectId(leaveTypeId)
      ? await LeaveType.findOne({ _id: leaveTypeId, tenantId, isActive: true } as any)
      : null;
    if (!leaveType) {
      return res.status(400).json({ message: 'Unknown leave type' });
    }

    // One pending/approved request per day: block overlaps instead of double-booking.
    const overlapping = await LeaveRequest.findOne({
      tenantId,
      userId: req.user!._id,
      status: { $in: ['Pending', 'Approved'] },
      startDate: { $lte: end },
      endDate: { $gte: start },
    } as any);
    if (overlapping) {
      return res.status(409).json({ message: 'You already have a leave request covering some of these dates' });
    }

    const leaveRequest = await LeaveRequest.create({
      tenantId,
      userId: req.user!._id as any,
      leaveTypeId,
      startDate: start,
      endDate: end,
      reason: String(reason).trim(),
      isHalfDay: halfDay,
      ...(halfDay && { halfDaySession }),
      ...(contactNumber && { contactNumber: String(contactNumber).trim() }),
      ...(contactEmail && { contactEmail: String(contactEmail).trim() }),
      ...(attachmentUrl && { attachmentUrl }),
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

    const existing = await LeaveRequest.findOne({ _id: id, tenantId } as any);
    if (!existing) return res.status(404).json({ message: 'Leave request not found' });
    if (String(existing.userId) === String(req.user!._id)) {
      return res.status(403).json({ message: 'You cannot approve or reject your own leave' });
    }

    // Only a pending request can be decided — a decision is never silently flipped.
    const leaveRequest = await LeaveRequest.findOneAndUpdate(
      { _id: id, tenantId, status: 'Pending' } as any,
      {
        status,
        approvedBy: req.user!._id as any,
        rejectionReason: status === 'Rejected' ? rejectionReason : undefined
      },
      { returnDocument: 'after' }
    );

    if (!leaveRequest) {
      return res.status(409).json({ message: `This request is already ${existing.status.toLowerCase()}` });
    }

    const range = `${moment(existing.startDate).format('DD MMM')}${moment(existing.endDate).isSame(existing.startDate, 'day') ? '' : ` – ${moment(existing.endDate).format('DD MMM')}`}`;
    await notifyUser(tenantId, existing.userId, req.user!._id, `Leave ${status.toLowerCase()}`,
      `Your leave for ${range} was ${status.toLowerCase()}${status === 'Rejected' && rejectionReason ? `: ${rejectionReason}` : '.'}`,
      '/dashboard/employee-leave');

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

/** The employee withdraws their own leave request while it is still pending. */
export const cancelMyLeave = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const leave = await LeaveRequest.findOneAndUpdate(
      { _id: req.params.id, tenantId, userId: req.user._id, status: 'Pending' } as any,
      { $set: { status: 'Cancelled' } },
      { returnDocument: 'after' }
    );
    if (!leave) return res.status(404).json({ message: 'No pending leave request of yours with that ID' });

    await AuditLog.create({
      tenantId, userId: req.user._id, action: 'CANCEL_LEAVE', module: 'Leaves', status: 'SUCCESS',
      ipAddress: req.ip as string, userAgent: req.headers['user-agent'] as string, details: { leaveRequestId: leave._id },
    } as any);
    res.json({ message: 'Leave request withdrawn', leaveRequest: leave });
  } catch (error: any) {
    res.status(500).json({ message: 'Error withdrawing leave', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
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
        .reduce((sum: number, r: any) => sum + leaveDays(r), 0);
      const pendingDays = pending.reduce((sum: number, r: any) => sum + leaveDays(r), 0);
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

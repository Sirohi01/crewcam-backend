import { Response } from 'express';
import moment from 'moment';
import { AuthRequest } from '../middleware/auth';
import { LeaveRequest } from '../models/LeaveRequest';
import { Expense } from '../models/Expense';
import { ProfileChangeRequest } from '../models/ProfileChangeRequest';
import { Ticket } from '../models/Ticket';
import { EmployeeQuery } from '../models/EmployeeQuery';
import { leaveDays } from '../utils/leaveDays';
import '../models/LeaveType';

/**
 * "My Requests" (Phase 1D-2): one list of everything the employee has asked for —
 * leave, reimbursements, HR-approved profile changes, helpdesk tickets and HR queries —
 * with statuses mapped onto one scale. Read-only; each item links to where it is managed.
 */

export type RequestKind = 'leave' | 'reimbursement' | 'profile-change' | 'ticket' | 'query';
export type RequestStatus = 'In Progress' | 'Approved' | 'Rejected' | 'Withdrawn';

interface MyRequestItem {
  id: string;
  kind: RequestKind;
  title: string;
  reference: string;
  status: RequestStatus;
  rawStatus: string;
  requestedOn: Date;
  updatedOn: Date;
  decidedBy?: string;
  note?: string;
  canWithdraw: boolean;
  link: string;
}

const name = (u: any) => (u && u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : undefined);
const ref = (prefix: string, id: unknown, at: Date) => `${prefix}-${moment(at).format('YYYY')}-${String(id).slice(-5).toUpperCase()}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const LEAVE: Record<string, RequestStatus> = { Pending: 'In Progress', Approved: 'Approved', Rejected: 'Rejected', Cancelled: 'Withdrawn' };
const EXPENSE: Record<string, RequestStatus> = { Pending: 'In Progress', Approved: 'Approved', Reimbursed: 'Approved', Rejected: 'Rejected', Withdrawn: 'Withdrawn' };
const CHANGE: Record<string, RequestStatus> = { Pending: 'In Progress', Approved: 'Approved', Rejected: 'Rejected', Cancelled: 'Withdrawn' };
// A resolved ticket or answered query counts as "approved" (done) on this scale.
const TICKET: Record<string, RequestStatus> = { Open: 'In Progress', In_Progress: 'In Progress', Resolved: 'Approved', Closed: 'Approved' };
const QUERY: Record<string, RequestStatus> = { Open: 'In Progress', InProgress: 'In Progress', Resolved: 'Approved' };

export const getMyRequests = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = (req.tenantId || req.user?.tenantId) as string;
    const userId = req.user!._id;

    const [leaves, expenses, changes, tickets, queries] = await Promise.all([
      LeaveRequest.find({ tenantId, userId } as any).populate('leaveTypeId', 'name').populate('approvedBy', 'firstName lastName').lean(),
      Expense.find({ tenantId, employeeId: userId } as any).lean(),
      ProfileChangeRequest.find({ tenantId, userId } as any).populate('reviewerId', 'firstName lastName').lean(),
      Ticket.find({ tenantId, employeeId: userId } as any).populate('assignedTo', 'firstName lastName').lean(),
      EmployeeQuery.find({ tenantId, raisedBy: userId } as any).populate('respondedBy', 'firstName lastName').lean(),
    ]);

    const items: MyRequestItem[] = [
      ...leaves.map((l: any) => ({
        id: String(l._id), kind: 'leave' as const,
        title: `${l.leaveTypeId?.name || 'Leave'} (${l.isHalfDay ? 'Half day' : plural(leaveDays(l), 'day')})`,
        reference: ref('LV', l._id, l.createdAt), status: LEAVE[l.status] || 'In Progress', rawStatus: l.status,
        requestedOn: l.createdAt, updatedOn: l.updatedAt, decidedBy: name(l.approvedBy), note: l.rejectionReason,
        canWithdraw: l.status === 'Pending', link: '/dashboard/employee-leave',
      })),
      ...expenses.map((e: any) => ({
        id: String(e._id), kind: 'reimbursement' as const,
        title: `${e.type} claim — ₹${Number(e.amount).toLocaleString('en-IN')}`,
        reference: ref('RB', e._id, e.createdAt), status: EXPENSE[e.status] || 'In Progress', rawStatus: e.status,
        requestedOn: e.createdAt, updatedOn: e.updatedAt, note: e.approverComments,
        canWithdraw: e.status === 'Pending', link: '/dashboard/reimbursement',
      })),
      ...changes.map((c: any) => ({
        id: String(c._id), kind: 'profile-change' as const,
        title: c.kind === 'bank' ? 'Bank account change' : 'Personal details change',
        reference: ref('PC', c._id, c.createdAt), status: CHANGE[c.status] || 'In Progress', rawStatus: c.status,
        requestedOn: c.createdAt, updatedOn: c.updatedAt, decidedBy: name(c.reviewerId), note: c.reviewerComment,
        canWithdraw: c.status === 'Pending', link: '/dashboard/my-profile-extension',
      })),
      ...tickets.map((t: any) => ({
        id: String(t._id), kind: 'ticket' as const, title: t.subject,
        reference: t.ticketNumber || ref('HD', t._id, t.createdAt), status: TICKET[t.status] || 'In Progress', rawStatus: t.status,
        requestedOn: t.createdAt, updatedOn: t.updatedAt, decidedBy: name(t.assignedTo), note: t.resolution,
        canWithdraw: false, link: '/dashboard/helpdesk',
      })),
      ...queries.map((q: any) => ({
        id: String(q._id), kind: 'query' as const, title: q.subject,
        reference: ref('QR', q._id, q.createdAt), status: QUERY[q.status] || 'In Progress', rawStatus: q.status,
        requestedOn: q.createdAt, updatedOn: q.respondedAt || q.updatedAt, decidedBy: name(q.respondedBy), note: q.response,
        canWithdraw: false, link: '/dashboard/communications/queries',
      })),
    ].sort((a, b) => +new Date(b.requestedOn) - +new Date(a.requestedOn));

    const count = (s: RequestStatus) => items.filter((i) => i.status === s).length;
    res.json({
      items,
      summary: { total: items.length, inProgress: count('In Progress'), approved: count('Approved'), rejected: count('Rejected'), withdrawn: count('Withdrawn') },
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching your requests', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

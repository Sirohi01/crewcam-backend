import { Response } from 'express';
import moment from 'moment';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { Ticket } from '../models/Ticket';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { AssetAllocation } from '../models/AssetAllocation';
import { isOwnUploadUrl } from '../utils/fileStorage';
import '../models/Asset';
import { NEW_TICKET_SCHEMA, nextTicketNumber } from './helpdeskController';
import { myNotificationFilter, toMyNotification } from '../utils/myNotifications';
import '../models/Designation';

/**
 * Employee self-service for the helpdesk, notifications and "my team" (Phase 1D-1).
 * Like the rest of /me, nothing here takes a user ID: tickets are always the caller's,
 * notifications are always ones addressed to the caller.
 */

const tenantIdOf = (req: AuthRequest) => (req.tenantId || req.user?.tenantId) as string;
const fail = (res: Response, message: string, error: any) =>
  res.status(500).json({ message, ...(process.env.NODE_ENV === 'production' ? {} : { error: error?.message }) });

// ── Helpdesk ──────────────────────────────────────────────────────────────

export const getMyTickets = async (req: AuthRequest, res: Response) => {
  try {
    const tickets = await Ticket.find({ tenantId: tenantIdOf(req), employeeId: req.user!._id } as any)
      .populate('assignedTo', 'firstName lastName')
      .sort({ createdAt: -1 })
      .lean();

    const monthStart = moment().startOf('month');
    const resolved = tickets.filter((t: any) => t.resolvedAt);
    const hours = resolved.map((t: any) => moment(t.resolvedAt).diff(moment(t.createdAt), 'hours', true));
    const lastUnrated = tickets.find((t: any) => ['Resolved', 'Closed'].includes(t.status) && !t.rating);

    res.json({
      tickets,
      stats: {
        total: tickets.length,
        open: tickets.filter((t: any) => t.status === 'Open').length,
        inProgress: tickets.filter((t: any) => t.status === 'In_Progress').length,
        resolvedThisMonth: resolved.filter((t: any) => moment(t.resolvedAt).isSameOrAfter(monthStart)).length,
        avgResolutionHours: hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null,
      },
      // The rating card asks about the most recent resolved ticket not yet rated.
      ratePrompt: lastUnrated ? { _id: (lastUnrated as any)._id, subject: (lastUnrated as any).subject, ticketNumber: (lastUnrated as any).ticketNumber } : null,
    });
  } catch (error) {
    fail(res, 'Error fetching your tickets', error);
  }
};

export const createMyTicket = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = tenantIdOf(req);
    const parsed = NEW_TICKET_SCHEMA.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid ticket', errors: parsed.error.issues });

    // A ticket about an asset must be about one assigned to you.
    if (parsed.data.assetId) {
      const mine = await AssetAllocation.exists({ tenantId, employeeId: req.user!._id, assetId: parsed.data.assetId, status: 'Active' } as any);
      if (!mine) return res.status(400).json({ message: 'That asset is not assigned to you' });
    }

    const ticket = await Ticket.create({
      ...parsed.data,
      tenantId,
      employeeId: req.user!._id,
      ticketNumber: await nextTicketNumber(tenantId),
    });
    await AuditLog.create({
      tenantId, userId: req.user!._id, action: 'CREATE_TICKET', module: 'Support', status: 'SUCCESS',
      ipAddress: req.ip as string, userAgent: req.headers['user-agent'] as string, details: { ticketId: ticket._id },
    } as any);
    res.status(201).json({ message: `Ticket ${ticket.ticketNumber} raised`, ticket });
  } catch (error) {
    fail(res, 'Error raising ticket', error);
  }
};

const RATING_SCHEMA = z.object({
  rating: z.number().int().min(1).max(5),
  feedback: z.string().trim().max(1000).optional(),
});

/** Rate how a resolved ticket was handled — once, and only your own. */
export const rateMyTicket = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = RATING_SCHEMA.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Rating must be 1 to 5', errors: parsed.error.issues });

    const ticket = await Ticket.findOneAndUpdate(
      {
        _id: req.params.id, tenantId: tenantIdOf(req), employeeId: req.user!._id,
        status: { $in: ['Resolved', 'Closed'] }, rating: { $exists: false },
      } as any,
      { $set: { ...parsed.data, ratedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!ticket) return res.status(404).json({ message: 'No resolved, unrated ticket of yours with that ID' });
    res.json({ message: 'Thanks for the feedback', ticket });
  } catch (error) {
    fail(res, 'Error saving rating', error);
  }
};

const PLATFORM_REPORT_SCHEMA = z.object({
  issueType: z.enum(['bug', 'question', 'feedback']),
  description: z.string().trim().min(5).max(5000),
  pageUrl: z.string().trim().max(500).optional(),
  screenshotUrl: z.string().refine(isOwnUploadUrl, 'Screenshot must be uploaded through the app').optional(),
});
const REPORT_LABEL = { bug: 'Bug report', question: 'Question', feedback: 'Feedback' } as const;

/**
 * "Report a problem" (floating button): goes to the CrewCam team — super admin's Support
 * page — not the company helpdesk, and isn't gated by the Helpdesk add-on. The reporter
 * can track it under My Tickets.
 */
export const createPlatformReport = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = tenantIdOf(req);
    const parsed = PLATFORM_REPORT_SCHEMA.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid report', errors: parsed.error.issues });
    const { issueType, description, pageUrl, screenshotUrl } = parsed.data;

    const firstLine = description.split(/\r?\n/)[0].slice(0, 80);
    const ticket = await Ticket.create({
      tenantId,
      employeeId: req.user!._id,
      channel: 'platform',
      department: 'IT',
      subject: `${REPORT_LABEL[issueType]}: ${firstLine}`,
      description,
      priority: issueType === 'bug' ? 'High' : 'Low',
      attachmentUrl: screenshotUrl,
      pageUrl,
      ticketNumber: await nextTicketNumber(tenantId),
    } as any);
    res.status(201).json({ message: `Thanks — sent to the CrewCam team as ${ticket.ticketNumber}`, ticket });
  } catch (error) {
    fail(res, 'Error sending your report', error);
  }
};

// ── Assets ────────────────────────────────────────────────────────────────

/** Assets assigned to you, current and returned, with the related open tickets. */
export const getMyAssets = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = tenantIdOf(req);
    const [allocations, openIssues] = await Promise.all([
      AssetAllocation.find({ tenantId, employeeId: req.user!._id } as any)
        .select('assetId allocatedDate returnDate condition status')
        .populate('assetId', 'name type serialNumber purchaseDate purchaseValue status')
        .sort({ status: 1, allocatedDate: -1 })
        .lean(),
      Ticket.find({ tenantId, employeeId: req.user!._id, assetId: { $exists: true }, status: { $in: ['Open', 'In_Progress'] } } as any)
        .select('assetId subject ticketNumber status createdAt')
        .lean(),
    ]);
    res.json({ allocations, openIssues });
  } catch (error) {
    fail(res, 'Error fetching your assets', error);
  }
};

// ── Notifications ─────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

/**
 * Newest first, 20 at a time (`before` = createdAt of the last item for "Load more").
 * Filters: status=unread|read, priority=High|Normal, kind=direct|announcement, from=YYYY-MM-DD.
 */
export const getMyNotificationFeed = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = tenantIdOf(req);
    const userId = req.user!._id;
    const base = myNotificationFilter(tenantId, req.user);
    const q = req.query as Record<string, string | undefined>;

    const and: any[] = [];
    if (q.status === 'unread') and.push({ readBy: { $ne: userId } });
    if (q.status === 'read') and.push({ readBy: userId });
    if (q.priority === 'High') and.push({ priority: 'High' });
    if (q.priority === 'Normal') and.push({ priority: { $ne: 'High' } });
    if (q.kind === 'direct') and.push({ audienceType: 'User' });
    if (q.kind === 'announcement') and.push({ audienceType: { $ne: 'User' } });
    const created: any = {};
    if (q.from && moment(q.from, 'YYYY-MM-DD', true).isValid()) created.$gte = moment(q.from).startOf('day').toDate();
    if (q.before && moment(q.before).isValid()) created.$lt = moment(q.before).toDate();
    if (Object.keys(created).length) and.push({ createdAt: created });

    const filter = and.length ? { ...base, $and: and } : base;
    const items = await Notification.find(filter as any).sort({ createdAt: -1 }).limit(PAGE_SIZE + 1).lean();

    const [total, unread, important, thisWeek] = await Promise.all([
      Notification.countDocuments(base as any),
      Notification.countDocuments({ ...base, readBy: { $ne: userId } } as any),
      Notification.countDocuments({ ...base, priority: 'High' } as any),
      Notification.countDocuments({ ...base, createdAt: { $gte: moment().startOf('isoWeek').toDate() } } as any),
    ]);

    res.json({
      items: items.slice(0, PAGE_SIZE).map((n) => toMyNotification(n, userId)),
      hasMore: items.length > PAGE_SIZE,
      summary: { total, unread, important, thisWeek },
    });
  } catch (error) {
    fail(res, 'Error fetching notifications', error);
  }
};

export const markMyNotificationRead = async (req: AuthRequest, res: Response) => {
  try {
    const result = await Notification.updateOne(
      { ...myNotificationFilter(tenantIdOf(req), req.user), _id: req.params.id } as any,
      { $addToSet: { readBy: req.user!._id } }
    );
    if (!result.matchedCount) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Marked as read' });
  } catch (error) {
    fail(res, 'Error updating notification', error);
  }
};

export const markAllMyNotificationsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const result = await Notification.updateMany(
      { ...myNotificationFilter(tenantIdOf(req), req.user), readBy: { $ne: userId } } as any,
      { $addToSet: { readBy: userId } }
    );
    res.json({ message: 'All caught up', updated: result.modifiedCount });
  } catch (error) {
    fail(res, 'Error updating notifications', error);
  }
};

// ── Team ──────────────────────────────────────────────────────────────────

/** The caller's direct reports — who they may delegate tasks to. */
export const getMyTeam = async (req: AuthRequest, res: Response) => {
  try {
    const team = await User.find({ tenantId: tenantIdOf(req), reportingToId: req.user!._id, isActive: true } as any)
      .select('firstName lastName employeeCode designationId profilePictureUrl')
      .populate('designationId', 'name')
      .sort({ firstName: 1 })
      .lean();
    res.json(team);
  } catch (error) {
    fail(res, 'Error fetching your team', error);
  }
};

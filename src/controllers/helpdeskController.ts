import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { Ticket, TICKET_CATEGORIES } from '../models/Ticket';
import { AuditLog } from '../models/AuditLog';
import { Counter } from '../models/Counter';
import { User } from '../models/User';
import { notifyUser } from './communicationController';
import { isOwnUploadUrl } from '../utils/fileStorage';

/** Fields anyone may set when raising a ticket. Status, assignee and resolution are HR's. */
export const NEW_TICKET_SCHEMA = z.object({
  department: z.enum(TICKET_CATEGORIES),
  subject: z.string().trim().min(3).max(150),
  description: z.string().trim().min(5).max(5000),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).default('Medium'),
  attachmentUrl: z.string().refine(isOwnUploadUrl, 'Attachments must be uploaded through the app').optional(),
  assetId: z.string().regex(/^[a-f\d]{24}$/i, 'invalid asset').optional(),
});

/** Next per-tenant, per-year reference, e.g. HD-2026-0007. Atomic via Counter. */
export const nextTicketNumber = async (tenantId: unknown) => {
  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { key: `HD-${tenantId}-${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return `HD-${year}-${String(counter!.seq).padStart(4, '0')}`;
};

const STATUS_LABEL: Record<string, string> = { Open: 'reopened', In_Progress: 'in progress', Resolved: 'resolved', Closed: 'closed' };

const logAudit = async (tenantId: any, userId: any, action: string, req: AuthRequest, details: any) => {
  await AuditLog.create({
    tenantId,
    userId,
    action,
    module: 'Support',
    status: 'SUCCESS',
    ipAddress: req.ip as string,
    userAgent: req.headers['user-agent'] as string,
    details
  } as any);
};

export const createTicket = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const parsed = NEW_TICKET_SCHEMA.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid ticket', errors: parsed.error.issues });

    const ticket = await Ticket.create({
      ...parsed.data,
      tenantId,
      employeeId: req.user!._id,
      ticketNumber: await nextTicketNumber(tenantId),
    });
    
    await logAudit(tenantId, req.user!._id, 'CREATE_TICKET', req, { ticketId: (ticket as any)._id });

    res.status(201).json(ticket);
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating ticket', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getTickets = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { status, department } = req.query;
    
    // Problem reports about CrewCam itself go to the platform team, not this queue.
    const filter: any = { tenantId, channel: { $ne: 'platform' } };
    if (status) filter.status = status;
    if (department) filter.department = department;

    // If regular employee, only show their own tickets. If admin/support, show all.
    // For simplicity, we fetch all here and let frontend/RBAC handle it, or we can filter by user role.
    // We'll just fetch all for now since RBAC is handled at the route level.

    const tickets = await Ticket.find(filter)
      .populate('employeeId', 'firstName lastName email profilePictureUrl')
      .populate('assignedTo', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.status(200).json(tickets);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching tickets', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const updateTicket = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const { status, assignedTo, resolution } = req.body;

    const existing = await Ticket.findOne({ _id: id, tenantId } as any);
    if (!existing) return res.status(404).json({ message: 'Ticket not found' });
    // Support staff can't resolve or reassign their own tickets — someone else handles them.
    if (String(existing.employeeId) === String(req.user!._id)) {
      return res.status(403).json({ message: 'You cannot update a ticket you raised yourself' });
    }
    if (assignedTo) {
      const assignee = await User.exists({ _id: assignedTo, tenantId } as any);
      if (!assignee) return res.status(400).json({ message: 'Assignee is not in this company' });
    }

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo || undefined;
    if (resolution !== undefined) updateData.resolution = String(resolution).slice(0, 5000);
    if (status === 'Resolved' || status === 'Closed') updateData.resolvedAt = new Date();

    const ticket = await Ticket.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { $set: updateData },
      { returnDocument: 'after', runValidators: true }
    );
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    if (status && status !== existing.status) {
      const ref = existing.ticketNumber || existing.subject;
      await notifyUser(tenantId, existing.employeeId, req.user!._id, `Ticket ${STATUS_LABEL[status] || 'updated'}`,
        `Your ticket "${existing.subject}" (${ref}) is now ${STATUS_LABEL[status] || status}.`, '/dashboard/helpdesk');
    }

    await logAudit(tenantId, req.user!._id, 'UPDATE_TICKET', req, { ticketId: id, status });
    res.status(200).json(ticket);
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating ticket', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

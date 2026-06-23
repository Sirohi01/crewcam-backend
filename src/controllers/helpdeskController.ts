import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Ticket } from '../models/Ticket';
import { AuditLog } from '../models/AuditLog';

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

    const ticket = await Ticket.create({ 
      ...req.body, 
      tenantId, 
      employeeId: req.user!._id 
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
    
    const filter: any = { tenantId };
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

    const updateData: any = { status };
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
    if (resolution !== undefined) updateData.resolution = resolution;
    if (status === 'Resolved' || status === 'Closed') updateData.resolvedAt = new Date();

    const ticket = await Ticket.findOneAndUpdate(
      { _id: id, tenantId } as any,
      updateData,
      { returnDocument: 'after' }
    );

    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    await logAudit(tenantId, req.user!._id, 'UPDATE_TICKET', req, { ticketId: id, status });
    res.status(200).json(ticket);
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating ticket', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { EmployeeQuery } from '../models/EmployeeQuery';
import { AuditLog } from '../models/AuditLog';

export const raiseQuery = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const { subject, message } = req.body;
    if (!subject || !message) return res.status(400).json({ message: 'Subject and message are required' });

    const query = await EmployeeQuery.create({
      tenantId,
      raisedBy: req.user._id,
      subject,
      message,
      status: 'Open',
    });

    res.status(201).json({ message: 'Query raised successfully', query });
  } catch (error: any) {
    res.status(500).json({ message: 'Error raising query', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getMyQueries = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const queries = await EmployeeQuery.find({ tenantId, raisedBy: req.user._id } as any).sort({ createdAt: -1 });
    res.status(200).json(queries);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching queries', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getAllQueries = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const { status } = req.query;
    const filter: any = { tenantId };
    if (status && ['Open', 'InProgress', 'Resolved'].includes(String(status))) filter.status = status;

    const queries = await EmployeeQuery.find(filter)
      .populate('raisedBy', 'firstName lastName email')
      .populate('respondedBy', 'firstName lastName')
      .sort({ createdAt: -1 });
    res.status(200).json(queries);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching queries', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const respondToQuery = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const { id } = req.params;
    const { response, status } = req.body;
    if (!response) return res.status(400).json({ message: 'Response is required' });

    const query = await EmployeeQuery.findOneAndUpdate(
      { _id: id, tenantId } as any,
      {
        response,
        status: ['Open', 'InProgress', 'Resolved'].includes(status) ? status : 'Resolved',
        respondedBy: req.user._id,
        respondedAt: new Date(),
      },
      { returnDocument: 'after', runValidators: true }
    );

    if (!query) return res.status(404).json({ message: 'Query not found' });

    await AuditLog.create({
      tenantId,
      userId: req.user._id,
      action: 'RESPOND_QUERY',
      module: 'Communication',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { queryId: query._id },
    } as any);

    res.status(200).json({ message: 'Query responded', query });
  } catch (error: any) {
    res.status(500).json({ message: 'Error responding to query', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

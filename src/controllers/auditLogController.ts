import { Response } from 'express';
import { AuditLog } from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';

export const getAuditLogs = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const query: any = { tenantId: req.user?.tenantId };

    if (req.query.module) query.module = req.query.module;
    if (req.query.action) query.action = req.query.action;
    if (req.query.userId) query.userId = req.query.userId;
    if (req.query.status) query.status = req.query.status;
    if (req.query.candidateId) query['details.candidateId'] = req.query.candidateId;

    const logs = await AuditLog.find(query)
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AuditLog.countDocuments(query);

    res.status(200).json({
      data: logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching audit logs' });
  }
};

export const createAuditLog = async (req: AuthRequest, res: Response) => {
  try {
    const { action, module, status, details } = req.body;
    
    if (!action || !module || !status) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const log = await AuditLog.create({
      tenantId: req.user?.tenantId,
      userId: req.user?._id,
      action,
      module,
      status,
      details,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({ message: 'Audit log created', data: log });
  } catch (error) {
    res.status(500).json({ message: 'Error creating audit log' });
  }
};

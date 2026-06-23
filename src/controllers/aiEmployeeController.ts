import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { EmployeeAiSummary } from '../models/EmployeeAiSummary';
import { AuditLog } from '../models/AuditLog';
import { generateEmployeeSummary, AiFeatureError } from '../services/aiService';

export const triggerEmployeeSummary = async (req: AuthRequest, res: Response) => {
  const tenantId = (req.tenantId || req.user!.tenantId) as string;
  const employeeId = req.params.employeeId as string;

  try {
    const summary = await generateEmployeeSummary(tenantId, employeeId, String(req.user!._id));

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'AI_EMPLOYEE_SUMMARY_GENERATE',
      module: 'HR Admin',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { employeeId, summaryId: summary._id },
    } as any);

    res.status(201).json({
      _id: summary._id,
      employeeId: summary.employeeId,
      windowDays: summary.windowDays,
      summaryText: summary.getDecryptedSummary(),
      status: summary.status,
      createdAt: (summary as any).createdAt,
    });
  } catch (error: any) {
    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'AI_EMPLOYEE_SUMMARY_GENERATE',
      module: 'HR Admin',
      status: 'FAILURE',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { employeeId, error: error.message },
    } as any);

    const statusCode = error instanceof AiFeatureError ? error.statusCode : 500;
    res.status(statusCode).json({
      message: error instanceof AiFeatureError ? error.message : 'AI employee summary failed',
      ...(process.env.NODE_ENV === 'production' && !(error instanceof AiFeatureError) ? {} : { error: error.message }),
    });
  }
};

/**
 * Audited on every read, not just on generate — this surfaces disciplinary/performance
 * history, sensitive enough that access itself should be logged (same principle as
 * Live Tracking's LIVE_TRACKING_VIEW from Phase I).
 */
export const getEmployeeSummaries = async (req: AuthRequest, res: Response) => {
  const tenantId = (req.tenantId || req.user!.tenantId) as string;
  const employeeId = req.params.employeeId as string;

  const summaries = await EmployeeAiSummary.find({ tenantId, employeeId }).sort({ createdAt: -1 });

  await AuditLog.create({
    tenantId,
    userId: req.user!._id as any,
    action: 'AI_EMPLOYEE_SUMMARY_VIEW',
    module: 'HR Admin',
    status: 'SUCCESS',
    ipAddress: req.ip as string,
    userAgent: req.headers['user-agent'] as string,
    details: { employeeId, count: summaries.length },
  } as any);

  res.json(summaries.map((s) => ({
    _id: s._id,
    employeeId: s.employeeId,
    windowDays: s.windowDays,
    summaryText: s.getDecryptedSummary(),
    status: s.status,
    failureReason: s.failureReason,
    createdAt: (s as any).createdAt,
  })));
};

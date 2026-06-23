import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ResumeScreening } from '../models/ResumeScreening';
import { Candidate } from '../models/Candidate';
import { AuditLog } from '../models/AuditLog';
import { screenResume, AiFeatureError } from '../services/aiService';

export const triggerResumeScreening = async (req: AuthRequest, res: Response) => {
  const tenantId = (req.tenantId || req.user!.tenantId) as string;
  const candidateId = req.params.candidateId as string;

  try {
    const screening = await screenResume(tenantId, candidateId, String(req.user!._id));

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'AI_RESUME_SCREEN',
      module: 'Hiring',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { candidateId, fitScore: screening.fitScore, resumeScreeningId: screening._id },
    } as any);

    const { extractedText, ...safeScreening } = screening.toObject();
    res.status(201).json(safeScreening);
  } catch (error: any) {
    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'AI_RESUME_SCREEN',
      module: 'Hiring',
      status: 'FAILURE',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { candidateId, error: error.message },
    } as any);

    const statusCode = error instanceof AiFeatureError ? error.statusCode : 500;
    res.status(statusCode).json({
      message: error instanceof AiFeatureError ? error.message : 'AI resume screening failed',
      ...(process.env.NODE_ENV === 'production' && !(error instanceof AiFeatureError) ? {} : { error: error.message }),
    });
  }
};

/** RBAC-gated to HR/Recruiter roles at the route level (ATS_READ) — never candidate-visible. */
export const getResumeScreenings = async (req: AuthRequest, res: Response) => {
  const tenantId = (req.tenantId || req.user!.tenantId) as string;
  const candidateId = req.params.candidateId as string;

  const screenings = await ResumeScreening.find({ tenantId, candidateId }).select('-extractedText').sort({ createdAt: -1 });
  res.json(screenings);
};

/** HR queue: every candidate with a resume, clearly marked when a new/updated file needs screening. */
export const getResumeScreeningQueue = async (req: AuthRequest, res: Response) => {
  const tenantId = (req.tenantId || req.user!.tenantId) as string;
  const candidates = await Candidate.find({ tenantId, resumeUrl: { $exists: true, $ne: '' } } as any)
    .select('firstName lastName email jobRole status resumeUrl resumeUpdatedAt updatedAt')
    .sort({ resumeUpdatedAt: -1, updatedAt: -1 })
    .lean();
  const candidateIds = candidates.map((candidate: any) => candidate._id);
  const screenings = await ResumeScreening.find({ tenantId, candidateId: { $in: candidateIds } } as any)
    .select('-extractedText')
    .sort({ createdAt: -1 })
    .lean();
  const latestByCandidate = new Map<string, any>();
  screenings.forEach((screening: any) => {
    const key = String(screening.candidateId);
    if (!latestByCandidate.has(key)) latestByCandidate.set(key, screening);
  });
  res.json(candidates.map((candidate: any) => {
    const latestScreening = latestByCandidate.get(String(candidate._id));
    const resumeChangedAt = candidate.resumeUpdatedAt || candidate.updatedAt;
    return {
      ...candidate,
      latestScreening,
      needsScreening: !latestScreening || new Date(resumeChangedAt) > new Date(latestScreening.createdAt),
    };
  }));
};

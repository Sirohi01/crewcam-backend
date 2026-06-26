import { Response } from 'express';
import { Types } from 'mongoose';
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

export const getResumeScreeningQueue = async (req: AuthRequest, res: Response) => {
  const tenantId = (req.tenantId || req.user!.tenantId) as string;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || ''); // 'pending' | 'screened' | '' (all)

  const match: any = { tenantId: new Types.ObjectId(tenantId), resumeUrl: { $exists: true, $ne: '' } };
  if (search) {
    match.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { jobRole: { $regex: search, $options: 'i' } },
    ];
  }

  const pipeline: any[] = [
    { $match: match },
    {
      $lookup: {
        from: 'resumescreenings',
        let: { candidateId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$candidateId', '$$candidateId'] } } },
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
          { $project: { extractedText: 0 } },
        ],
        as: 'screenings',
      },
    },
    { $addFields: { latestScreening: { $arrayElemAt: ['$screenings', 0] } } },
    {
      $addFields: {
        needsScreening: {
          $or: [
            { $eq: ['$latestScreening', null] },
            { $gt: [{ $ifNull: ['$resumeUpdatedAt', '$updatedAt'] }, '$latestScreening.createdAt'] },
          ],
        },
      },
    },
  ];

  if (status === 'pending') pipeline.push({ $match: { needsScreening: true } });
  if (status === 'screened') pipeline.push({ $match: { needsScreening: false } });

  pipeline.push(
    { $project: { screenings: 0 } },
    { $sort: { resumeUpdatedAt: -1, updatedAt: -1 } },
    {
      $facet: {
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        totalCount: [{ $count: 'count' }],
      },
    },
  );

  const [result] = await Candidate.aggregate(pipeline);
  const total = result?.totalCount?.[0]?.count || 0;

  res.json({
    data: result?.data || [],
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  });
};

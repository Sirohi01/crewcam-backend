import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Candidate } from '../models/Candidate';
import { Interview } from '../models/Interview';
import { ManpowerRequest } from '../models/ManpowerRequest';
import { AuditLog } from '../models/AuditLog';
import { advanceStep, getOrCreatePipelineState } from '../utils/hiringPipelineHelpers';
import { evaluateGate, STEP_RULES } from '../utils/hiringPipelineRules';

// Candidate Controllers
export const createCandidate = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    if (!req.body.manpowerRequestId) {
      return res.status(400).json({ message: 'An approved manpower request is required before adding a candidate' });
    }
    const manpowerRequest = await ManpowerRequest.findOne({ _id: req.body.manpowerRequestId, tenantId } as any);
    if (!manpowerRequest || manpowerRequest.status !== 'Approved') {
      return res.status(409).json({ message: 'Select an approved manpower request before adding a candidate' });
    }

    const candidate = await Candidate.create({ ...req.body, tenantId, ...(req.body.resumeUrl ? { resumeUpdatedAt: new Date() } : {}) });

    // Step 1 has no real prerequisite in the gating table (it precedes any candidate existing) —
    // initialize this candidate's pipeline with it already completed, referencing the manpower
    // request that justified this hire if one was supplied.
    await advanceStep(req, String(tenantId), String((candidate as any)._id), 'manpowerRequest', 'completed', req.body.manpowerRequestId);

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'CREATE_CANDIDATE',
      module: 'ATS',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { candidateId: (candidate as any)._id }
    } as any);

    res.status(201).json(candidate);
  } catch (error: any) {
    console.error('Error creating candidate:', error);
    res.status(500).json({ message: 'Error creating candidate' });
  }
};

export const getCandidates = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { status, page, limit, search } = req.query;
    const filter: any = { tenantId };
    if (status) filter.status = status;
    if (search && String(search).trim()) {
      const term = String(search).trim();
      filter.$or = [
        { firstName: { $regex: term, $options: 'i' } },
        { lastName: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } },
        { jobRole: { $regex: term, $options: 'i' } },
        { source: { $regex: term, $options: 'i' } },
      ];
    }

    const query = Candidate.find(filter).sort({ createdAt: -1 });
    if (page || limit) {
      const resolvedPage = Math.max(1, Number(page) || 1);
      const resolvedLimit = Math.min(100, Math.max(1, Number(limit) || 20));
      const [candidates, total] = await Promise.all([
        query.skip((resolvedPage - 1) * resolvedLimit).limit(resolvedLimit),
        Candidate.countDocuments(filter),
      ]);
      return res.status(200).json({ data: candidates, meta: { page: resolvedPage, limit: resolvedLimit, total, totalPages: Math.ceil(total / resolvedLimit) } });
    }

    const candidates = await query;
    res.status(200).json(candidates);
  } catch (error: any) {
    console.error('Error fetching candidates:', error);
    res.status(500).json({ message: 'Error fetching candidates' });
  }
};

export const getCandidateById = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const candidate = await Candidate.findOne({ _id: id, tenantId } as any);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });
    res.status(200).json(candidate);
  } catch (error: any) {
    console.error('Error fetching candidate:', error);
    res.status(500).json({ message: 'Error fetching candidate' });
  }
};

export const getCandidatePipelineState = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.params;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const state = await getOrCreatePipelineState(String(tenantId), String(candidateId));
    if (!state) return res.status(404).json({ message: 'Pipeline state not found' });

    const steps = state.steps.map((step) => ({
      stepNumber: step.stepNumber,
      key: step.key,
      status: step.status,
      checklist: step.checklist,
      completedAt: step.completedAt,
      approvedBy: step.approvedBy,
      refId: step.refId,
      gate: evaluateGate(state.steps, step.key),
    }));

    const missingRules = STEP_RULES.filter((rule) => !steps.some((step) => step.key === rule.key));
    for (const rule of missingRules) {
      steps.push({
        stepNumber: rule.stepNumber,
        key: rule.key,
        status: 'pending',
        checklist: [],
        completedAt: undefined,
        approvedBy: undefined,
        refId: undefined,
        gate: evaluateGate(state.steps, rule.key),
      });
    }

    res.status(200).json({
      candidateId: state.candidateId,
      employeeId: state.employeeId,
      currentStep: state.currentStep,
      steps: steps.sort((a, b) => a.stepNumber - b.stepNumber),
    });
  } catch (error: any) {
    console.error('Error fetching candidate pipeline state:', error);
    res.status(500).json({ message: 'Error fetching candidate pipeline state' });
  }
};

export const updateCandidateStatus = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const { status, rating, comments, resumeUrl } = req.body;

    const candidate = await Candidate.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { ...(status && { status }), ...(rating && { rating }), ...(comments && { comments }), ...(resumeUrl && { resumeUrl, resumeUpdatedAt: new Date() }) },
      { returnDocument: 'after' }
    );

    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'UPDATE_CANDIDATE_STATUS',
      module: 'ATS',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { candidateId: id, ...(status && { newStatus: status }), ...(resumeUrl && { resumeAttached: true }) }
    } as any);

    res.status(200).json(candidate);
  } catch (error: any) {
    console.error('Error updating candidate status:', error);
    res.status(500).json({ message: 'Error updating candidate status' });
  }
};

// Interview Controllers
export const scheduleInterview = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const interview = await Interview.create({ ...req.body, tenantId });

    // Automatically move candidate to Interviewing status if not already
    await Candidate.findOneAndUpdate(
      { _id: req.body.candidateId, tenantId } as any,
      { status: 'Interviewing' }
    );

    await advanceStep(req, String(tenantId), req.body.candidateId, 'interview', 'in_progress', (interview as any)._id);

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'SCHEDULE_INTERVIEW',
      module: 'ATS',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { interviewId: (interview as any)._id, candidateId: req.body.candidateId }
    } as any);

    res.status(201).json(interview);
  } catch (error: any) {
    console.error('Error scheduling interview:', error);
    res.status(500).json({ message: 'Error scheduling interview' });
  }
};

export const getInterviewsForCandidate = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.params;

    const interviews = await Interview.find({ tenantId, candidateId } as any)
      .populate('interviewerId', 'firstName lastName email')
      .sort({ scheduledDate: 1 });

    res.status(200).json(interviews);
  } catch (error: any) {
    console.error('Error fetching interviews:', error);
    res.status(500).json({ message: 'Error fetching interviews' });
  }
};

/** Tenant-wide interview register used by the dedicated Hiring sidebar pages. */
export const getAllInterviews = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const { status, roundType, page, limit, search } = req.query;
    const filter: any = { tenantId };
    if (status) filter.status = status;
    if (roundType) filter.roundType = roundType;
    if (search && String(search).trim()) {
      const term = String(search).trim();
      filter.$or = [
        { roundType: { $regex: term, $options: 'i' } },
        { status: { $regex: term, $options: 'i' } },
        { mode: { $regex: term, $options: 'i' } },
        { location: { $regex: term, $options: 'i' } },
        { meetingLink: { $regex: term, $options: 'i' } },
        { feedback: { $regex: term, $options: 'i' } },
      ];
    }

    const query = Interview.find(filter)
      .populate('candidateId', 'firstName lastName email jobRole status profileImageUrl')
      .populate('interviewerId', 'firstName lastName email')
      .sort({ scheduledDate: -1 });

    if (page || limit) {
      const resolvedPage = Math.max(1, Number(page) || 1);
      const resolvedLimit = Math.min(100, Math.max(1, Number(limit) || 20));
      const [interviews, total] = await Promise.all([
        query.skip((resolvedPage - 1) * resolvedLimit).limit(resolvedLimit),
        Interview.countDocuments(filter),
      ]);
      return res.status(200).json({ data: interviews, meta: { page: resolvedPage, limit: resolvedLimit, total, totalPages: Math.ceil(total / resolvedLimit) } });
    }

    const interviews = await query;
    res.status(200).json(interviews);
  } catch (error: any) {
    console.error('Error fetching interviews:', error);
    res.status(500).json({ message: 'Error fetching interviews' });
  }
};
export const getInterviewStats = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const { roundType } = req.query;
    const filter: any = { tenantId };
    if (roundType) filter.roundType = { $in: String(roundType).split(',') };

    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [total, upcoming, completed, interviewerIds] = await Promise.all([
      Interview.countDocuments(filter),
      Interview.countDocuments({ ...filter, status: 'Scheduled', scheduledDate: { $gte: now, $lte: in7Days } }),
      Interview.countDocuments({ ...filter, status: 'Completed' }),
      Interview.distinct('interviewerId', filter),
    ]);

    res.status(200).json({ total, upcoming, completed, interviewers: interviewerIds.length });
  } catch (error: any) {
    console.error('Error fetching interview stats:', error);
    res.status(500).json({ message: 'Error fetching interview stats' });
  }
};
export const updateInterview = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const { interviewerId, roundType, scheduledDate, mode, location, meetingLink } = req.body;

    const existing = await Interview.findOne({ _id: id, tenantId } as any);
    if (!existing) return res.status(404).json({ message: 'Interview not found' });
    if (existing.status !== 'Scheduled') {
      return res.status(400).json({ message: 'Only a still-scheduled interview can be edited — this one already has an outcome recorded' });
    }

    existing.interviewerId = interviewerId;
    existing.roundType = roundType;
    existing.scheduledDate = scheduledDate;
    existing.mode = mode;
    existing.location = location;
    existing.meetingLink = meetingLink;
    await existing.save();

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'UPDATE_INTERVIEW',
      module: 'ATS',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { interviewId: id },
    } as any);

    const populated = await Interview.findById(id)
      .populate('candidateId', 'firstName lastName email jobRole status profileImageUrl')
      .populate('interviewerId', 'firstName lastName email');
    res.status(200).json(populated);
  } catch (error: any) {
    console.error('Error updating interview:', error);
    res.status(500).json({ message: 'Error updating interview' });
  }
};

export const submitInterviewFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const { status, rating, feedback } = req.body;

    const interview = await Interview.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { status, rating, feedback },
      { returnDocument: 'after' }
    );

    if (!interview) return res.status(404).json({ message: 'Interview not found' });

    if (status === 'Completed') {
      await advanceStep(req, String(tenantId), String(interview.candidateId), 'interview', 'completed', (interview as any)._id);
    }

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'SUBMIT_INTERVIEW_FEEDBACK',
      module: 'ATS',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { interviewId: id }
    } as any);

    res.status(200).json(interview);
  } catch (error: any) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ message: 'Error submitting feedback' });
  }
};

// Manpower Request Controllers
export const createManpowerRequest = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const request = await ManpowerRequest.create({ ...req.body, tenantId });

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'CREATE_MANPOWER_REQUEST',
      module: 'ATS',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { requestId: (request as any)._id }
    } as any);

    res.status(201).json(request);
  } catch (error: any) {
    console.error('Error creating manpower request:', error);
    res.status(500).json({ message: 'Error creating manpower request' });
  }
};

export const getManpowerRequests = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const requests = await ManpowerRequest.find({ tenantId } as any).sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (error: any) {
    console.error('Error fetching manpower requests:', error);
    res.status(500).json({ message: 'Error fetching manpower requests' });
  }
};

export const updateManpowerRequestStatus = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const { status } = req.body;

    const request = await ManpowerRequest.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { status },
      { returnDocument: 'after' }
    );

    if (!request) return res.status(404).json({ message: 'Manpower request not found' });

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'UPDATE_MANPOWER_REQUEST_STATUS',
      module: 'ATS',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { requestId: id, newStatus: status }
    } as any);

    res.status(200).json(request);
  } catch (error: any) {
    console.error('Error updating manpower request status:', error);
    res.status(500).json({ message: 'Error updating manpower request status' });
  }
};

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ManpowerRequest } from '../models/ManpowerRequest';
import { InterviewEvaluation } from '../models/InterviewEvaluation';
import { SelectionApproval } from '../models/SelectionApproval';
import { AuditLog } from '../models/AuditLog';
import { advanceStep } from '../utils/hiringPipelineHelpers';

const logAudit = async (tenantId: any, userId: any, action: string, req: AuthRequest, details: any) => {
  await AuditLog.create({
    tenantId,
    userId,
    action,
    module: 'Hiring',
    status: 'SUCCESS',
    ipAddress: req.ip as string,
    userAgent: req.headers['user-agent'] as string,
    details
  } as any);
};

// Step 1: Manpower Request Form
export const createManpowerRequest = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const request = await ManpowerRequest.create({ ...req.body, tenantId, requestedBy: req.user!._id });
    await logAudit(tenantId, req.user!._id, 'CREATE_MANPOWER_REQUEST', req, { requestId: (request as any)._id });

    res.status(201).json(request);
  } catch (error: any) {
    console.error('Error creating manpower request:', error);
    res.status(500).json({ message: 'Error creating manpower request' });
  }
};

export const getManpowerRequests = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { status } = req.query;
    const filter: any = { tenantId };
    if (status) filter.status = status;

    const requests = await ManpowerRequest.find(filter)
      .populate('requestedBy', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (error: any) {
    console.error('Error fetching manpower requests:', error);
    res.status(500).json({ message: 'Error fetching manpower requests' });
  }
};

/** The requisition is the source record. It can be amended only until approval. */
export const updateManpowerRequest = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const current = await ManpowerRequest.findOne({ _id: id, tenantId } as any);
    if (!current) return res.status(404).json({ message: 'Manpower request not found' });
    if (current.status !== 'Pending') return res.status(409).json({ message: 'Only pending manpower requests can be edited' });

    const request = await ManpowerRequest.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { ...req.body, tenantId, status: current.status, requestedBy: current.requestedBy },
      { returnDocument: 'after' }
    );
    await logAudit(tenantId, req.user!._id, 'UPDATE_MANPOWER_REQUEST', req, { requestId: id });
    res.status(200).json(request);
  } catch (error: any) {
    console.error('Error updating manpower request:', error);
    res.status(500).json({ message: 'Error updating manpower request' });
  }
};

export const updateManpowerRequestStatus = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    const update: any = { status };
    if (status === 'Approved') {
      update.approvedBy = req.user!._id;
      update.approvalDate = new Date();
    }
    if (status === 'Rejected') {
      update.rejectionReason = rejectionReason;
    }

    const request = await ManpowerRequest.findOneAndUpdate({ _id: id, tenantId } as any, update, { returnDocument: 'after' });
    if (!request) return res.status(404).json({ message: 'Manpower request not found' });

    await logAudit(tenantId, req.user!._id, 'UPDATE_MANPOWER_REQUEST_STATUS', req, { requestId: id, status });
    res.status(200).json(request);
  } catch (error: any) {
    console.error('Error updating manpower request:', error);
    res.status(500).json({ message: 'Error updating manpower request' });
  }
};

// Step 2: Interview Evaluation Sheet
export const createInterviewEvaluation = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const evaluation = await InterviewEvaluation.create({ ...req.body, tenantId, interviewerId: req.user!._id });
    await advanceStep(req, tenantId, req.body.candidateId, 'interviewEvaluation', 'completed', (evaluation as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_INTERVIEW_EVALUATION', req, { evaluationId: (evaluation as any)._id });

    res.status(201).json(evaluation);
  } catch (error: any) {
    console.error('Error creating interview evaluation:', error);
    res.status(500).json({ message: 'Error creating interview evaluation' });
  }
};

export const getInterviewEvaluations = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;

    const evaluations = await InterviewEvaluation.find(filter)
      .populate('interviewerId', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.status(200).json(evaluations);
  } catch (error: any) {
    console.error('Error fetching interview evaluations:', error);
    res.status(500).json({ message: 'Error fetching interview evaluations' });
  }
};

// Step 3: Selection Approval Note
export const createSelectionApproval = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const approval = await SelectionApproval.create({ ...req.body, tenantId });
    await advanceStep(req, tenantId, req.body.candidateId, 'selectionApproval', 'completed', (approval as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_SELECTION_APPROVAL', req, { approvalId: (approval as any)._id });

    res.status(201).json(approval);
  } catch (error: any) {
    console.error('Error creating selection approval:', error);
    res.status(500).json({ message: 'Error creating selection approval' });
  }
};

export const getSelectionApprovals = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;

    const approvals = await SelectionApproval.find(filter)
      .populate('approvedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.status(200).json(approvals);
  } catch (error: any) {
    console.error('Error fetching selection approvals:', error);
    res.status(500).json({ message: 'Error fetching selection approvals' });
  }
};

export const updateSelectionApprovalDecision = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const { finalStatus } = req.body;

    const approval = await SelectionApproval.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { finalStatus, approvedBy: req.user!._id, approvalDate: new Date() },
      { returnDocument: 'after' }
    );
    if (!approval) return res.status(404).json({ message: 'Selection approval not found' });

    if (finalStatus === 'Approved') {
      await advanceStep(req, tenantId, String(approval.candidateId), 'selectionApproval', 'approved', approval._id as any);
    } else if (finalStatus === 'Rejected') {
      await advanceStep(req, tenantId, String(approval.candidateId), 'selectionApproval', 'rejected', approval._id as any);
    }

    await logAudit(tenantId, req.user!._id, 'UPDATE_SELECTION_APPROVAL', req, { approvalId: id, finalStatus });
    res.status(200).json(approval);
  } catch (error: any) {
    console.error('Error updating selection approval:', error);
    res.status(500).json({ message: 'Error updating selection approval' });
  }
};

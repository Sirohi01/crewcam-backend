import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { JoiningConfirmation } from '../models/JoiningConfirmation';
import { DocumentChecklist } from '../models/DocumentChecklist';
import { BGVRequest } from '../models/BGVRequest';
import { Candidate } from '../models/Candidate';
import { AuditLog } from '../models/AuditLog';
import { notificationService } from '../services/notificationService';
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

// Step 6: Joining Confirmation Mail
export const createJoiningConfirmation = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const candidate = await Candidate.findOne({ _id: req.body.candidateId, tenantId } as any);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    const confirmation = await JoiningConfirmation.create({
      ...req.body,
      tenantId,
      sentBy: req.user!._id,
      emailSentTo: candidate.email
    });

    await notificationService.sendEmail(
      String(tenantId),
      candidate.email,
      'Joining Confirmation',
      `Dear ${candidate.firstName}, your joining is confirmed for ${confirmation.confirmedJoiningDate}.`
    );

    confirmation.status = 'Sent';
    confirmation.emailSentAt = new Date();
    await confirmation.save();

    await advanceStep(req, tenantId, req.body.candidateId, 'joiningConfirmation', 'in_progress', (confirmation as any)._id);

    await logAudit(tenantId, req.user!._id, 'SEND_JOINING_CONFIRMATION', req, { confirmationId: (confirmation as any)._id });
    res.status(201).json(confirmation);
  } catch (error: any) {
    console.error('Error creating joining confirmation:', error);
    res.status(500).json({ message: 'Error creating joining confirmation' });
  }
};

export const getJoiningConfirmations = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;

    const confirmations = await JoiningConfirmation.find(filter).sort({ createdAt: -1 });
    res.status(200).json(confirmations);
  } catch (error: any) {
    console.error('Error fetching joining confirmations:', error);
    res.status(500).json({ message: 'Error fetching joining confirmations' });
  }
};

export const confirmJoiningByCandidate = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    const confirmation = await JoiningConfirmation.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { confirmedByCandidate: true, status: 'Confirmed' },
      { returnDocument: 'after' }
    );
    if (!confirmation) return res.status(404).json({ message: 'Joining confirmation not found' });

    await advanceStep(req, tenantId, String(confirmation.candidateId), 'joiningConfirmation', 'completed', confirmation._id as any);

    await logAudit(tenantId, req.user!._id, 'CANDIDATE_CONFIRM_JOINING', req, { confirmationId: id });
    res.status(200).json(confirmation);
  } catch (error: any) {
    console.error('Error confirming joining:', error);
    res.status(500).json({ message: 'Error confirming joining' });
  }
};

// Step 7: Document Checklist
export const createDocumentChecklist = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const checklist = await DocumentChecklist.create({ ...req.body, tenantId });
    await advanceStep(req, tenantId, req.body.candidateId, 'documentChecklist', 'in_progress', (checklist as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_DOC_CHECKLIST', req, { checklistId: (checklist as any)._id });
    res.status(201).json(checklist);
  } catch (error: any) {
    console.error('Error creating document checklist:', error);
    res.status(500).json({ message: 'Error creating document checklist' });
  }
};

export const getDocumentChecklists = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;

    const checklists = await DocumentChecklist.find(filter).sort({ createdAt: -1 });
    res.status(200).json(checklists);
  } catch (error: any) {
    console.error('Error fetching document checklists:', error);
    res.status(500).json({ message: 'Error fetching document checklists' });
  }
};

export const updateDocumentChecklistItem = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id, itemIndex } = req.params;
    const { status, fileUrl, remarks } = req.body;

    const checklist = await DocumentChecklist.findOne({ _id: id, tenantId } as any);
    if (!checklist) return res.status(404).json({ message: 'Document checklist not found' });

    const idx = parseInt(String(itemIndex), 10);
    if (!checklist.items[idx]) return res.status(404).json({ message: 'Checklist item not found' });

    checklist.items[idx].status = status || checklist.items[idx].status;
    if (fileUrl) checklist.items[idx].fileUrl = fileUrl;
    if (remarks) checklist.items[idx].remarks = remarks;
    if (status === 'Verified') {
      checklist.items[idx].verifiedBy = req.user!._id as any;
      checklist.items[idx].verifiedAt = new Date();
    }

    const allVerified = checklist.items.every(i => i.status === 'Verified');
    const allSubmitted = checklist.items.every(i => i.status === 'Submitted' || i.status === 'Verified');
    checklist.overallStatus = allVerified ? 'Verified' : allSubmitted ? 'Complete' : 'Incomplete';

    await checklist.save();

    if (checklist.overallStatus === 'Complete' || checklist.overallStatus === 'Verified') {
      await advanceStep(req, tenantId, String(checklist.candidateId), 'documentChecklist', 'completed', checklist._id as any);
    }

    await logAudit(tenantId, req.user!._id, 'UPDATE_DOC_CHECKLIST_ITEM', req, { checklistId: id, itemIndex: idx, status });
    res.status(200).json(checklist);
  } catch (error: any) {
    console.error('Error updating checklist item:', error);
    res.status(500).json({ message: 'Error updating checklist item' });
  }
};

// Step 8: BGV Request Form & BGV Report
export const createBGVRequest = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const bgv = await BGVRequest.create({ ...req.body, tenantId, requestedBy: req.user!._id });
    await advanceStep(req, tenantId, req.body.candidateId, 'bgvRequest', 'in_progress', (bgv as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_BGV_REQUEST', req, { bgvId: (bgv as any)._id });
    res.status(201).json(bgv);
  } catch (error: any) {
    console.error('Error creating BGV request:', error);
    res.status(500).json({ message: 'Error creating BGV request' });
  }
};

export const getBGVRequests = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;

    const requests = await BGVRequest.find(filter)
      .populate('requestedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (error: any) {
    console.error('Error fetching BGV requests:', error);
    res.status(500).json({ message: 'Error fetching BGV requests' });
  }
};

export const updateBGVReport = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const { status, reportUrl, overallResult, discrepancyDetails } = req.body;

    const update: any = { status };
    if (reportUrl) update.reportUrl = reportUrl;
    if (overallResult) update.overallResult = overallResult;
    if (discrepancyDetails) update.discrepancyDetails = discrepancyDetails;
    if (status === 'Completed') update.completedDate = new Date();

    const bgv = await BGVRequest.findOneAndUpdate({ _id: id, tenantId } as any, update, { returnDocument: 'after' });
    if (!bgv) return res.status(404).json({ message: 'BGV request not found' });

    if (bgv.overallResult === 'Discrepancy') {
      await advanceStep(req, tenantId, String(bgv.candidateId), 'bgvRequest', 'rejected', bgv._id as any);
    } else if (status === 'Completed') {
      await advanceStep(req, tenantId, String(bgv.candidateId), 'bgvRequest', 'completed', bgv._id as any);
    }

    await logAudit(tenantId, req.user!._id, 'UPDATE_BGV_REPORT', req, { bgvId: id, status });
    res.status(200).json(bgv);
  } catch (error: any) {
    console.error('Error updating BGV report:', error);
    res.status(500).json({ message: 'Error updating BGV report' });
  }
};

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ManpowerRequest } from '../models/ManpowerRequest';
import { InterviewEvaluation } from '../models/InterviewEvaluation';
import { SelectionApproval } from '../models/SelectionApproval';
import { Candidate } from '../models/Candidate';
import { AuditLog } from '../models/AuditLog';
import { advanceStep } from '../utils/hiringPipelineHelpers';
import { getSignedCloudinaryPdfUrl, savePdfToCloudinary } from '../utils/pdfGenerator';
import { generateManpowerRequisitionPdfBuffer } from '../utils/manpowerPdfGenerator';
import { getCompanyDocumentBranding } from '../utils/companyDocumentBranding';

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

export const streamHiringPdf = async (req: AuthRequest, res: Response) => {
  try {
    const url = String(req.query.url || '');
    if (!url) return res.status(400).json({ message: 'PDF URL is required' });

    const signedUrl = getSignedCloudinaryPdfUrl(url);
    const response = await fetch(signedUrl);
    if (!response.ok) {
      return res.status(response.status).json({
        message: 'Unable to load PDF from Cloudinary',
        cloudinaryError: response.headers.get('x-cld-error') || undefined,
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="hiring-document.pdf"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(buffer);
  } catch (error: any) {
    console.error('Error streaming hiring PDF:', error);
    res.status(500).json({ message: error.message || 'Error streaming hiring PDF' });
  }
};

// Step 1: Manpower Request Form
export const createManpowerRequest = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const request = await ManpowerRequest.create({ ...req.body, tenantId, requestedBy: req.body.requestedBy || req.user!._id });
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
    const { status, page, limit, search } = req.query;
    const filter: any = { tenantId };
    if (status) filter.status = status;
    if (search && String(search).trim()) {
      const term = String(search).trim();
      filter.$or = [
        { jobTitle: { $regex: term, $options: 'i' } },
        { designation: { $regex: term, $options: 'i' } },
        { workLocation: { $regex: term, $options: 'i' } },
        { priority: { $regex: term, $options: 'i' } },
        { recruitmentStatus: { $regex: term, $options: 'i' } },
      ];
    }

    const query = ManpowerRequest.find(filter)
      .populate('departmentId', 'name')
      .populate('locationBranchId', 'name city state')
      .populate('reportingTo', 'firstName lastName email')
      .populate('requestedBy', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });
    if (page || limit) {
      const resolvedPage = Math.max(1, Number(page) || 1);
      const resolvedLimit = Math.min(100, Math.max(1, Number(limit) || 20));
      const [requests, total] = await Promise.all([query.skip((resolvedPage - 1) * resolvedLimit).limit(resolvedLimit), ManpowerRequest.countDocuments(filter)]);
      return res.status(200).json({ data: requests, meta: { page: resolvedPage, limit: resolvedLimit, total, totalPages: Math.ceil(total / resolvedLimit) } });
    }
    const requests = await query;
    res.status(200).json(requests);
  } catch (error: any) {
    console.error('Error fetching manpower requests:', error);
    res.status(500).json({ message: 'Error fetching manpower requests' });
  }
};

export const getManpowerRequestById = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const request = await ManpowerRequest.findOne({ _id: req.params.id, tenantId } as any)
      .populate('departmentId', 'name')
      .populate('locationBranchId', 'name city state')
      .populate('reportingTo', 'firstName lastName email')
      .populate('requestedBy', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email');
    if (!request) return res.status(404).json({ message: 'Manpower request not found' });
    res.status(200).json(request);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching manpower request' });
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

/** Generates a branded requisition PDF from the same tenant-scoped source record. */
export const generateManpowerRequestPdf = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const request = await ManpowerRequest.findOne({ _id: req.params.id, tenantId } as any)
      .populate('departmentId', 'name')
      .populate('locationBranchId', 'name city state')
      .populate('reportingTo', 'firstName lastName')
      .populate('requestedBy', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName')
      .populate('budgetApprovedBy', 'firstName lastName');
    if (!request) return res.status(404).json({ message: 'Manpower request not found' });

    const branding = await getCompanyDocumentBranding(tenantId);
    const department = (request.departmentId as any)?.name || 'N/A';
    const branch = (request.locationBranchId as any)?.name || request.workLocation || 'N/A';
    const reporting = request.reportingTo as any;
    const lines = [
      { label: 'Department', value: department },
      { label: 'Position / Designation', value: `${request.jobTitle}${request.designation ? ` / ${request.designation}` : ''}` },
      { label: 'No. of positions', value: String(request.numberOfPositions) },
      { label: 'Work location', value: branch },
      { label: 'Employment type', value: (request.employmentTypes || [request.employmentType]).join(', ') },
      { label: 'Reason for hiring', value: (request.hiringReasons || [request.reasonForHiring]).join(', ') },
      { label: 'Required joining date', value: request.requiredJoiningDate ? new Date(request.requiredJoiningDate).toDateString() : 'N/A' },
      { label: 'Salary range', value: request.salaryCtcMin || request.salaryCtcMax ? `${request.salaryCtcMin || '—'} to ${request.salaryCtcMax || '—'} ${'INR'}` : 'N/A' },
      { label: 'Reporting to', value: reporting?.firstName ? `${reporting.firstName} ${reporting.lastName || ''}` : 'N/A' },
      { label: 'Job description', value: request.jobDescriptionSummary || 'N/A' },
      { label: 'KRA / responsibilities', value: request.kraReport || (request.keyResponsibilities || []).join('; ') || 'N/A' },
      { label: 'Justification', value: request.detailedJustification || request.justification || 'N/A' },
      { label: 'Recruitment status', value: request.recruitmentStatus || request.status },
    ];
    const fullName = (user: any) => user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : '';
    const formatDate = (date?: Date) => date ? new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    const buffer = await generateManpowerRequisitionPdfBuffer({
      ...branding,
      department,
      requestDate: formatDate(request.requestDate),
      requestedBy: fullName(request.requestedBy),
      designation: request.designation || request.jobTitle,
      jobTitle: request.jobTitle,
      position: request.designation || request.jobTitle,
      employmentType: (request.employmentTypes?.length ? request.employmentTypes : [request.employmentType]).filter(Boolean).join(', '),
      reportingTo: fullName(request.reportingTo),
      locationOfPosting: branch,
      reasonForHiring: (request.hiringReasons?.length ? request.hiringReasons : [request.reasonForHiring]).filter(Boolean).join(', '),
      replacementName: request.replacementName || '',
      detailedJustification: request.detailedJustification || request.justification || '',
      jobDescriptionSummary: request.jobDescriptionSummary || '',
      kraReport: request.kraReport || (request.keyResponsibilities || []).map((item) => `• ${item}`).join('\n'),
      salaryCtcMin: request.salaryCtcMin ? String(request.salaryCtcMin) : '',
      salaryCtcMax: request.salaryCtcMax || request.budgetCTC ? String(request.salaryCtcMax || request.budgetCTC) : '',
      budgetApprovedBy: fullName(request.budgetApprovedBy),
      benefits: request.benefits || [],
      otherBenefits: request.otherBenefits || '',
      requiredJoiningDate: formatDate(request.requiredJoiningDate),
      isUrgent: request.isUrgent ? 'Yes' : 'No',
      requestReceivedOn: formatDate(request.requestReceivedOn),
      approvedBy: fullName(request.approvedBy),
      recruitmentStartDate: formatDate(request.recruitmentStartDate),
      recruitmentStatus: request.recruitmentStatus || request.status,
      departmentHeadSignature: request.departmentHeadSignature || '',
      hrHeadSignature: request.hrHeadSignature || '',
      directorApprovalSignature: request.directorApprovalSignature || '',
    });
    const pdfUrl = await savePdfToCloudinary(buffer, `manpower-request-${request._id}.pdf`);
    request.pdfUrl = pdfUrl;
    await request.save();
    await logAudit(tenantId, req.user!._id, 'GENERATE_MANPOWER_REQUEST_PDF', req, { requestId: request._id });
    res.status(200).json({ pdfUrl, request });
  } catch (error: any) {
    console.error('Error generating manpower request PDF:', error);
    res.status(500).json({ message: 'Error generating manpower request PDF' });
  }
};

// Step 2: Interview Evaluation Sheet
export const createInterviewEvaluation = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    let candidateId = req.body.candidateId;
    if (!candidateId && req.body.candidateName) {
      const [firstName, ...lastNameParts] = req.body.candidateName.split(' ');
      const lastName = lastNameParts.join(' ') || 'Unknown';
      const email = `${firstName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'candidate'}@example.com`;
      const candidate = await Candidate.findOne({ email, tenantId });
      if (candidate) {
        candidateId = candidate._id;
      } else {
        const newCandidate = await Candidate.create({ tenantId, firstName, lastName, email, phone: '0000000000', jobRole: 'Candidate' });
        candidateId = newCandidate._id;
      }
    }

    const evaluation = await InterviewEvaluation.create({
      ...req.body,
      tenantId,
      candidateId,
      interviewerId: req.user!._id,
      roundType: req.body.round === 'HR' ? 'HR' : 'Technical',
      evaluationCriteria: [{ criterion: 'General', score: parseInt(req.body.score) || 3 }],
      overallScore: parseInt(req.body.score) || 3,
      recommendation: 'Recommend',
      interviewerDecision: req.body.hrDecision,
      strengths: req.body.strengths,
      improvementAreas: req.body.areasOfImprovement,
      comments: req.body.interviewer,
    });
    
    if (candidateId) {
      await advanceStep(req, tenantId, candidateId, 'interviewEvaluation', 'completed', (evaluation as any)._id);
    }
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
      .populate('candidateId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .lean();
      
    const mapped = evaluations.map((ev: any) => ({
      _id: ev._id,
      candidateName: ev.candidateId ? `${(ev.candidateId as any).firstName} ${(ev.candidateId as any).lastName}`.trim() : 'Unknown',
      round: ev.roundType,
      interviewer: ev.comments || ((ev.interviewerId as any)?.firstName ? `${(ev.interviewerId as any).firstName} ${(ev.interviewerId as any).lastName}` : 'Admin'),
      score: ev.overallScore ? `${ev.overallScore}/10` : 'N/A',
      decision: ev.interviewerDecision || 'Pending',
      createdBy: ev.interviewerId,
      updatedAt: ev.updatedAt
    }));

    res.status(200).json({ data: mapped });
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

    let candidateId = req.body.candidateId;
    if (!candidateId && req.body.candidateName) {
      const [firstName, ...lastNameParts] = req.body.candidateName.split(' ');
      const lastName = lastNameParts.join(' ') || 'Unknown';
      const email = `${firstName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'candidate'}@example.com`;
      const candidate = await Candidate.findOne({ email, tenantId });
      if (candidate) {
        candidateId = candidate._id;
      } else {
        const newCandidate = await Candidate.create({ tenantId, firstName, lastName, email, phone: '0000000000', jobRole: req.body.proposedPosition || 'Candidate' });
        candidateId = newCandidate._id;
      }
    }

    const approval = await SelectionApproval.create({
      ...req.body,
      tenantId,
      candidateId,
      position: req.body.proposedPosition,
      proposedCTC: parseFloat(req.body.proposedAnnualCTC?.replace(/,/g, '') || '0') || 0,
      budgetedCTC: parseFloat(req.body.budgetedCTC?.replace(/,/g, '') || '0') || 0,
      recruitmentSource: req.body.recruitmentSource,
      justificationForVariance: req.body.justification,
      finalStatus: 'Pending'
    });
    
    if (candidateId) {
      await advanceStep(req, tenantId, candidateId, 'selectionApproval', 'completed', (approval as any)._id);
    }
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
      .populate('candidateId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .lean();

    const mapped = approvals.map((app: any) => ({
      _id: app._id,
      candidateName: app.candidateId ? `${(app.candidateId as any).firstName} ${(app.candidateId as any).lastName}`.trim() : 'Unknown',
      proposedPosition: app.position || 'N/A',
      proposedAnnualCTC: app.proposedCTC?.toLocaleString() || 'N/A',
      decision: app.finalStatus || 'Pending',
      createdBy: app.approvedBy,
      updatedAt: app.updatedAt
    }));

    res.status(200).json({ data: mapped });
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

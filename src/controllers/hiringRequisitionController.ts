import { Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { ManpowerRequest } from '../models/ManpowerRequest';
import { InterviewEvaluation } from '../models/InterviewEvaluation';
import { SelectionApproval } from '../models/SelectionApproval';
import { Candidate } from '../models/Candidate';
import { User } from '../models/User';
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

    const requestedBy = req.body.requestedBy || req.user!._id;
    let pendingApprovalFrom = null;

    const requestUser = await User.findOne({ _id: requestedBy, tenantId }).populate('departmentId').populate('roleId');
    const userRole = (requestUser?.roleId as any)?.category || (requestUser?.roleId as any)?.name;
    const isHod = userRole.toLowerCase() === 'hod';
    const isAdmin = userRole.toLowerCase() === 'company_admin' || userRole.toLowerCase() === 'admin';
    const reqDepartmentId = req.body.departmentId || requestUser?.departmentId?._id || requestUser?.departmentId;

    if (!isAdmin && reqDepartmentId) {
      if (isHod) {
        // If HOD created it, route to Company Admin / Director
        const roles = await mongoose.model('Role').find({ tenantId, category: { $in: ['company_admin', 'admin', 'director'] } });
        const superAdmin = await User.findOne({ roleId: { $in: roles.map(r => r._id) }, tenantId });
        if (superAdmin) pendingApprovalFrom = superAdmin._id;
      } else {
        // If HR, Manager, Employee created it, route to HOD of that department
        const roles = await mongoose.model('Role').find({ tenantId, category: { $in: ['hod', 'admin', 'company_admin'] } });
        const hod = await User.findOne({ departmentId: reqDepartmentId, roleId: { $in: roles.map(r => r._id) }, tenantId });
        if (hod) {
          pendingApprovalFrom = hod._id;
        } else {
          // Fallback to super admin if no HOD found for that department
          const adminRoles = await mongoose.model('Role').find({ tenantId, category: { $in: ['company_admin', 'admin'] } });
          const superAdmin = await User.findOne({ roleId: { $in: adminRoles.map(r => r._id) }, tenantId });
          if (superAdmin) pendingApprovalFrom = superAdmin._id;
        }
      }
    }

    const request = await ManpowerRequest.create({ 
      ...req.body, 
      tenantId, 
      requestedBy, 
      pendingApprovalFrom,
      status: pendingApprovalFrom ? 'Pending' : 'Approved'
    });
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
    const { status, departmentId, page, limit, search, dateFrom, dateTo } = req.query;
    const filter: any = { tenantId };
    if (status && status !== 'All') filter.status = status;
    if (departmentId) filter.departmentId = departmentId;
    if (dateFrom || dateTo) {
      filter.requestDate = {};
      if (dateFrom) filter.requestDate.$gte = new Date(String(dateFrom));
      if (dateTo) filter.requestDate.$lte = new Date(String(dateTo));
    }
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
      .populate('pendingApprovalFrom', 'firstName lastName email')
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

/** Lightweight summary cards for the register (counts are tenant-wide, not page-limited). */
export const getManpowerRequestStats = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const [total, approved, pending, positionsAgg] = await Promise.all([
      ManpowerRequest.countDocuments({ tenantId } as any),
      ManpowerRequest.countDocuments({ tenantId, status: 'Approved' } as any),
      ManpowerRequest.countDocuments({ tenantId, status: 'Pending' } as any),
      ManpowerRequest.aggregate([{ $match: { tenantId: new Types.ObjectId(String(tenantId)) } }, { $group: { _id: null, total: { $sum: '$numberOfPositions' } } }]),
    ]);

    res.status(200).json({ total, approved, pending, totalPositions: positionsAgg[0]?.total || 0 });
  } catch (error: any) {
    console.error('Error fetching manpower request stats:', error);
    res.status(500).json({ message: 'Error fetching manpower request stats' });
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
      .populate('approvedBy', 'firstName lastName email')
      .populate('pendingApprovalFrom', 'firstName lastName email');
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

    const update: any = { status, pendingApprovalFrom: null };
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

    const { candidateId } = req.body;
    if (!candidateId) return res.status(400).json({ message: 'Candidate is required for an interview evaluation' });

    const candidate = await Candidate.findOne({ _id: candidateId, tenantId }).select('_id').lean();
    if (!candidate) return res.status(404).json({ message: 'Candidate not found for this organisation' });

    const permittedRounds = ['Telephonic', 'Technical', 'HR', 'Managerial', 'Final'];
    const roundType = permittedRounds.includes(req.body.roundType)
      ? req.body.roundType
      : (permittedRounds.includes(req.body.round) ? req.body.round : 'HR');
    const permittedRecommendations = ['Strongly Recommend', 'Recommend', 'Neutral', 'Not Recommend', 'Strongly Reject'];
    const recommendation = permittedRecommendations.includes(req.body.recommendation)
      ? req.body.recommendation
      : 'Recommend';
    const criteriaInput = Array.isArray(req.body.evaluationCriteria)
      ? req.body.evaluationCriteria
      : (Array.isArray(req.body.competencyRatings) ? req.body.competencyRatings : []);
    const evaluationCriteria = criteriaInput.length
      ? criteriaInput.map((row: any) => ({
          criterion: String(row.criterion || 'General'),
          score: Math.min(5, Math.max(1, Number(row.score) || 3)),
          ...(row.remarks ? { remarks: String(row.remarks) } : {}),
        }))
      : [{ criterion: 'General', score: Math.min(5, Math.max(1, Number(req.body.overallScore || req.body.score) || 3)) }];
    const calculatedOverall = Math.round((evaluationCriteria.reduce((sum: number, row: any) => sum + row.score, 0) / evaluationCriteria.length) * 10) / 10;
    const suppliedOverall = Number(req.body.overallScore);

    const evaluation = await InterviewEvaluation.create({
      ...req.body,
      tenantId,
      candidateId,
      interviewerId: req.user!._id,
      ...(req.body.interviewId ? { interviewId: req.body.interviewId } : {}),
      roundType,
      evaluationCriteria,
      competencyRatings: evaluationCriteria,
      overallScore: Number.isFinite(suppliedOverall) && suppliedOverall > 0 ? Math.min(5, Math.max(1, suppliedOverall)) : calculatedOverall,
      recommendation,
      ...(req.body.candidateSnapshot ? { candidateSnapshot: req.body.candidateSnapshot } : {}),
      ...(req.body.improvementAreas || req.body.areasOfImprovement ? { improvementAreas: req.body.improvementAreas || req.body.areasOfImprovement } : {}),
      ...(req.body.proposedSalaryMin !== '' && req.body.proposedSalaryMin !== undefined ? { proposedSalaryMin: Number(req.body.proposedSalaryMin) } : {}),
      ...(req.body.proposedSalaryMax !== '' && req.body.proposedSalaryMax !== undefined ? { proposedSalaryMax: Number(req.body.proposedSalaryMax) } : {}),
      ...(req.body.interviewerDecision || req.body.hrDecision ? { interviewerDecision: req.body.interviewerDecision || req.body.hrDecision } : {}),
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
      .populate('candidateId', 'firstName lastName phone email jobRole')
      .sort({ createdAt: -1 })
      .lean();

    const enriched = evaluations.map((ev: any) => ({
      ...ev,
      candidateName: ev.candidateId ? `${(ev.candidateId as any).firstName} ${(ev.candidateId as any).lastName}`.trim() : 'Unknown',
      round: ev.roundType,
      interviewer: ev.comments || ((ev.interviewerId as any)?.firstName ? `${(ev.interviewerId as any).firstName} ${(ev.interviewerId as any).lastName}` : 'Admin'),
      score: ev.overallScore ? `${ev.overallScore}/10` : 'N/A',
      decision: ev.interviewerDecision || 'Pending',
      createdBy: ev.interviewerId,
      updatedAt: ev.updatedAt
    }));

    res.status(200).json({ data: enriched });
  } catch (error: any) {
    console.error('Error fetching interview evaluations:', error);
    res.status(500).json({ message: 'Error fetching interview evaluations' });
  }
};

export const deleteInterviewEvaluation = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    
    const evaluation = await InterviewEvaluation.findOneAndDelete({ _id: id, tenantId } as any);
    if (!evaluation) return res.status(404).json({ message: 'Evaluation not found' });
    
    await logAudit(tenantId, req.user!._id, 'DELETE_INTERVIEW_EVALUATION', req, { evaluationId: id });
    res.status(200).json({ message: 'Evaluation deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting interview evaluation:', error);
    res.status(500).json({ message: 'Error deleting interview evaluation' });
  }
};

// Step 3: Selection Approval Note
export const createSelectionApproval = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const candidateId = req.body.candidateId;
    if (!candidateId) return res.status(400).json({ message: 'Candidate is required for selection approval' });
    const candidate = await Candidate.findOne({ _id: candidateId, tenantId }).select('_id').lean();
    if (!candidate) return res.status(404).json({ message: 'Candidate not found for this organisation' });

    const approvalChain = Array.isArray(req.body.approvalChain) ? req.body.approvalChain.filter((entry: any) => entry?.approverId) : [];
    if (!approvalChain.length) return res.status(400).json({ message: 'Add at least one approver from the employee list' });
    const approverIds = approvalChain.map((entry: any) => entry.approverId);
    const employees = await User.find({ tenantId, _id: { $in: approverIds } } as any).select('_id').lean();
    if (employees.length !== approverIds.length) return res.status(400).json({ message: 'Every approval-chain approver must be an employee from this company' });

    const approval = await SelectionApproval.create({
      ...req.body,
      tenantId,
      candidateId,
      approvalChain,
      jobRole: req.body.jobRole || req.body.proposedPosition || 'Candidate',
      proposedCTC: Number(req.body.proposedCTC ?? String(req.body.proposedAnnualCTC || '0').replace(/,/g, '')) || 0,
      budgetedCTC: Number(String(req.body.budgetedCTC || '0').replace(/,/g, '')) || 0,
      justificationForVariance: req.body.justificationForVariance || req.body.justification || undefined,
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
      .populate('approvalChain.approverId', 'firstName lastName employeeCode')
      .sort({ createdAt: -1 })
      .lean();

    const enriched = approvals.map((app: any) => ({
      ...app,
      candidateName: app.candidateId ? `${(app.candidateId as any).firstName} ${(app.candidateId as any).lastName}`.trim() : 'Unknown',
      position: app.jobRole || 'N/A',
      department: 'N/A',
      joiningDate: 'N/A',
      status: app.finalStatus || 'Pending',
      proposedAnnualCTC: app.proposedCTC?.toLocaleString() || 'N/A',
      createdBy: app.approvedBy,
      updatedAt: app.updatedAt
    }));

    res.status(200).json({ data: enriched });
  } catch (error: any) {
    console.error('Error fetching selection approvals:', error);
    res.status(500).json({ message: 'Error fetching selection approvals' });
  }
};

export const updateSelectionApproval = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    
    const proposedCTC = Number(req.body.proposedCTC ?? String(req.body.proposedAnnualCTC || '0').replace(/,/g, '')) || 0;
    const budgetedCTC = Number(String(req.body.budgetedCTC || '0').replace(/,/g, '')) || 0;
    
    let approvalChain = req.body.approvalChain;
    if (Array.isArray(approvalChain)) {
       approvalChain = approvalChain.filter((entry: any) => entry?.approverId);
    }
    
    const updateData: any = {
      ...req.body,
      tenantId,
      proposedCTC,
      budgetedCTC,
      justificationForVariance: req.body.justificationForVariance || req.body.justification || undefined,
    };
    if (approvalChain) {
        updateData.approvalChain = approvalChain;
    }
    if (req.body.jobRole || req.body.proposedPosition) {
        updateData.jobRole = req.body.jobRole || req.body.proposedPosition;
    }

    const approval = await SelectionApproval.findOneAndUpdate(
      { _id: id, tenantId } as any,
      updateData,
      { returnDocument: 'after' }
    );
    
    if (!approval) return res.status(404).json({ message: 'Selection approval not found' });

    await logAudit(tenantId, req.user!._id, 'UPDATE_SELECTION_APPROVAL_RECORD', req, { approvalId: id });
    res.status(200).json(approval);
  } catch (error: any) {
    console.error('Error updating selection approval:', error);
    res.status(500).json({ message: 'Error updating selection approval' });
  }
};

export const updateSelectionApprovalDecision = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const { finalStatus } = req.body;
    if (!['Approved', 'Rejected'].includes(finalStatus)) return res.status(400).json({ message: 'Decision must be Approved or Rejected' });

    const approval = await SelectionApproval.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { finalStatus, approvedBy: req.user!._id, approvalDate: new Date() },
      { returnDocument: 'after' }
    );
    if (!approval) return res.status(404).json({ message: 'Selection approval not found' });

    const chainEntry = (approval.approvalChain || []).find((entry: any) => String(entry.approverId) === String(req.user!._id));
    if (chainEntry) {
      chainEntry.status = finalStatus;
      chainEntry.actionDate = new Date();
      await approval.save();
    }

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

export const deleteSelectionApproval = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    
    const approval = await SelectionApproval.findOneAndDelete({ _id: id, tenantId } as any);
    if (!approval) return res.status(404).json({ message: 'Selection approval not found' });
    
    await logAudit(tenantId, req.user!._id, 'DELETE_SELECTION_APPROVAL', req, { approvalId: id });
    res.status(200).json({ message: 'Selection approval deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting selection approval:', error);
    res.status(500).json({ message: 'Error deleting selection approval' });
  }
};

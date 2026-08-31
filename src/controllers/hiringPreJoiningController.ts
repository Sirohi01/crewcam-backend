import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { JoiningConfirmation } from '../models/JoiningConfirmation';
import { DocumentChecklist } from '../models/DocumentChecklist';
import { BGVRequest } from '../models/BGVRequest';
import { Candidate } from '../models/Candidate';
import { LetterOfIntent } from '../models/LetterOfIntent';
import { ManpowerRequest } from '../models/ManpowerRequest';
import { HiringPipelineState } from '../models/HiringPipelineState';
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

    const candidateId = req.body.candidateId;
    const candidate = candidateId ? await Candidate.findOne({ _id: candidateId, tenantId } as any) : null;
    
    if (!candidateId || !candidate) return res.status(404).json({ message: 'Candidate not found' });

    // Step 6 must be safe even when it is called directly: derive all known
    // joining details from the already-saved LOI and approved manpower request.
    const pipeline = await HiringPipelineState.findOne({ tenantId, candidateId } as any).lean();
    const manpowerRef = pipeline?.steps?.find((step: any) => step.key === 'manpowerRequest')?.refId;
    const [loi, manpower] = await Promise.all([
      LetterOfIntent.findOne({ tenantId, candidateId } as any).sort({ createdAt: -1 }).lean(),
      manpowerRef ? ManpowerRequest.findOne({ _id: manpowerRef, tenantId } as any)
        .populate('reportingTo', 'firstName lastName')
        .lean() : Promise.resolve(null),
    ]);

    const confirmation = await JoiningConfirmation.create({
      ...req.body,
      tenantId,
      candidateId,
      confirmedJoiningDate: req.body.confirmedJoiningDate || req.body.joiningDate || loi?.joiningDate || manpower?.requiredJoiningDate,
      reportingManagerId: req.body.reportingManagerId || (manpower?.reportingTo as any)?._id || manpower?.reportingTo,
      reportingManagerName: req.body.reportingManagerName || `${(manpower?.reportingTo as any)?.firstName || ''} ${(manpower?.reportingTo as any)?.lastName || ''}`.trim() || undefined,
      reportingTime: req.body.reportingTime || '09:30 AM',
      reportingLocation: req.body.reportingLocation || manpower?.workLocation,
      sentBy: req.user!._id,
      emailSentTo: candidate.email,
      status: req.body.confirmationStatus || 'Sent'
    });

    try {
      await notificationService.sendEmail(
        String(tenantId),
        candidate.email,
        'Joining Confirmation',
        `Dear ${candidate.firstName}, your joining is confirmed for ${confirmation.confirmedJoiningDate}.`
      );
      confirmation.emailSentAt = new Date();
      await confirmation.save();
    } catch (e) {
      console.warn("Could not send email, continuing");
    }

    if (candidateId) {
      await advanceStep(req, tenantId, candidateId, 'joiningConfirmation', 'in_progress', (confirmation as any)._id);
    }

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

    const confirmations = await JoiningConfirmation.find(filter)
      .populate('candidateId', 'firstName lastName jobRole')
      .populate('sentBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();

    const mapped = confirmations.map((c: any) => ({
      ...c,
      _id: c._id,
      candidateName: c.candidateId ? `${(c.candidateId as any).firstName} ${(c.candidateId as any).lastName}`.trim() : 'Unknown',
      position: (c.candidateId as any)?.jobRole || 'N/A',
      joiningDate: c.confirmedJoiningDate || null,
      reportingTime: c.reportingTime || 'N/A',
      status: c.status || 'Pending',
      createdBy: c.sentBy,
      updatedAt: c.updatedAt
    }));

    res.status(200).json({ data: mapped });
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

    const candidateId = req.body.candidateId;
    if (!candidateId) return res.status(400).json({ message: 'Candidate is required for document checklist' });
    if (candidateId !== '000000000000000000000000') {
      const candidate = await Candidate.findOne({ _id: candidateId, tenantId }).select('_id').lean();
      if (!candidate) return res.status(404).json({ message: 'Candidate not found for this organisation' });
    }

    const items = Array.isArray(req.body.items) && req.body.items.length
      ? req.body.items.map((item: any) => ({
          documentName: String(item.documentName || 'Document'),
          isMandatory: item.isMandatory !== 'false' && item.isMandatory !== false,
          status: item.status || 'Pending',
          fileUrl: item.fileUrl || undefined,
          remarks: item.remarks || undefined,
        }))
      : [
          ...(req.body.aadharStatus ? [{ documentName: 'Aadhaar Card', status: req.body.aadharStatus }] : []),
          ...(req.body.panStatus ? [{ documentName: 'PAN Card', status: req.body.panStatus }] : []),
          ...(req.body.eduStatus ? [{ documentName: 'Educational Certificates', status: req.body.eduStatus }] : []),
        ];

    let overallStatus = 'Incomplete'; if (req.body.overallStatus !== undefined) { overallStatus = req.body.overallStatus; } else { const allVerified = items.every((i: { status: string }) => i.status === 'Verified'); const allSubmitted = items.every((i: { status: string }) => i.status === 'Submitted' || i.status === 'Verified'); overallStatus = allVerified ? 'Verified' : allSubmitted ? 'Complete' : 'Incomplete'; }

const checklist = await DocumentChecklist.create({ tenantId, candidateId, ...(items.length > 0 ? { items } : {}), overallStatus: overallStatus as 'Incomplete' | 'Verified' | 'Complete' });

    if (candidateId) {
      await advanceStep(req, tenantId, candidateId, 'documentChecklist', 'in_progress', (checklist as any)._id);
    }
    await logAudit(tenantId, req.user!._id, 'CREATE_DOC_CHECKLIST', req, { checklistId: (checklist as any)._id });
    res.status(201).json(checklist);
  } catch (error: any) {
    console.error('Error creating document checklist:', error);
    res.status(500).json({ message: 'Error creating document checklist' });
  }
};

export const updateDocumentChecklist = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    const checklist = await DocumentChecklist.findOne({ _id: id, tenantId } as any);
    if (!checklist) return res.status(404).json({ message: 'Document checklist not found' });

    if (req.body.items && Array.isArray(req.body.items)) {
      checklist.items = req.body.items.map((item: any) => ({
        documentName: String(item.documentName || 'Document'),
        isMandatory: item.isMandatory !== 'false' && item.isMandatory !== false,
        status: item.status || 'Pending',
        fileUrl: item.fileUrl || undefined,
        remarks: item.remarks || undefined,
      })) as any;
    }
    
    if (req.body.employeeName !== undefined) checklist.employeeName = req.body.employeeName;
    if (req.body.designation !== undefined) (checklist as any).designation = req.body.designation;
    if (req.body.department !== undefined) (checklist as any).department = req.body.department;
    if (req.body.dateOfJoining !== undefined) (checklist as any).dateOfJoining = req.body.dateOfJoining;
    if (req.body.workLocation !== undefined) (checklist as any).workLocation = req.body.workLocation;
    if (req.body.employeeCode !== undefined) (checklist as any).employeeCode = req.body.employeeCode;
    if (req.body.employeeSignatureDate !== undefined) (checklist as any).employeeSignatureDate = req.body.employeeSignatureDate;
    if (req.body.hrName !== undefined) (checklist as any).hrName = req.body.hrName;
    if (req.body.hrRemarks !== undefined) (checklist as any).hrRemarks = req.body.hrRemarks;
    if (req.body.hrSignatureDate !== undefined) (checklist as any).hrSignatureDate = req.body.hrSignatureDate;

    if (req.body.overallStatus !== undefined) { checklist.overallStatus = req.body.overallStatus; } else { const allVerified = checklist.items.every(i => i.status === 'Verified'); const allSubmitted = checklist.items.every(i => i.status === 'Submitted' || i.status === 'Verified'); checklist.overallStatus = allVerified ? 'Verified' : allSubmitted ? 'Complete' : 'Incomplete'; }

    await checklist.save();

    if (checklist.overallStatus === 'Complete' || checklist.overallStatus === 'Verified') {
      await advanceStep(req, tenantId, String(checklist.candidateId), 'documentChecklist', 'completed', checklist._id as any);
    }

    await logAudit(tenantId, req.user!._id, 'UPDATE_DOC_CHECKLIST', req, { checklistId: id });
    res.status(200).json(checklist);
  } catch (error: any) {
    console.error('Error updating document checklist:', error);
    res.status(500).json({ message: 'Error updating document checklist' });
  }
};

export const getDocumentChecklists = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;

    const checklists = await DocumentChecklist.find(filter)
      .populate('candidateId', 'firstName lastName jobRole')
      .sort({ createdAt: -1 })
      .lean();

    const mapped = checklists.map((c: any) => {
      const items = c.items || [];
      const submittedCount = items.filter((i: any) => i.status === 'Submitted' || i.status === 'Verified').length;
      
      return {
        ...c,
        _id: c._id,
        candidateName: c.candidateId ? `${(c.candidateId as any).firstName} ${(c.candidateId as any).lastName}`.trim() : c.employeeName || 'Unknown',
        position: (c.candidateId as any)?.jobRole || c.designation || '-',
        docsSubmitted: `${submittedCount}/${items.length || 3}`,
        bgvStatus: 'Pending', // BGV is a separate schema, so we keep pending or pull if needed
        status: c.overallStatus || 'Pending',
        createdBy: null,
        updatedAt: c.updatedAt
      };
    });

    res.status(200).json({ data: mapped });
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

    if (req.body.overallStatus !== undefined) { checklist.overallStatus = req.body.overallStatus; } else { const allVerified = checklist.items.every(i => i.status === 'Verified'); const allSubmitted = checklist.items.every(i => i.status === 'Submitted' || i.status === 'Verified'); checklist.overallStatus = allVerified ? 'Verified' : allSubmitted ? 'Complete' : 'Incomplete'; }

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

    if ((bgv as any).overallResult === 'Discrepancy') {
      await advanceStep(req, tenantId, req.body.candidateId, 'bgvRequest', 'rejected', (bgv as any)._id);
    } else if ((bgv as any).status === 'Completed' || (bgv as any).overallResult === 'Clear') {
      await advanceStep(req, tenantId, req.body.candidateId, 'bgvRequest', 'completed', (bgv as any)._id);
    } else {
      await advanceStep(req, tenantId, req.body.candidateId, 'bgvRequest', 'in_progress', (bgv as any)._id);
    }

    await logAudit(tenantId, req.user!._id, 'CREATE_BGV_REQUEST', req, { bgvId: (bgv as any)._id });
    res.status(201).json(bgv);
  } catch (error: any) {
    console.error('Error creating BGV request:', error);
    require('fs').writeFileSync('d:/NewHrCrm/crewcam-backend/bgv_error.log', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    res.status(500).json({ message: 'Error creating BGV request', error: error.message });
  }
};

export const getBGVRequests = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;

    const requests = await BGVRequest.find(filter)
      .populate('candidateId', 'firstName lastName jobRole')
      .populate('requestedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();
    const mapped = requests.map((r: any) => ({
      ...r,
      _id: r._id,
      candidateName: r.candidateId ? `${(r.candidateId as any).firstName} ${(r.candidateId as any).lastName}`.trim() : r.fullName || r.reportCandidateName || 'Unknown',
      position: r.positionFor || (r.candidateId && (r.candidateId as any).jobRole) || '-',
      phoneNumber: r.mobileNo || r.homeNo || '-',
      email: r.emailId || '-',
      department: r.department || r.reportDepartment || '-',
      status: r.status || 'Pending',
      updatedAt: r.updatedAt
    }));
    res.status(200).json({ data: mapped });
  } catch (error: any) {
    console.error('Error fetching BGV requests:', error);
    res.status(500).json({ message: 'Error fetching BGV requests' });
  }
};

export const updateBGVRequest = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    const bgv = await BGVRequest.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { ...req.body },
      { returnDocument: 'after' }
    );
    if (!bgv) return res.status(404).json({ message: 'BGV request not found' });

    // Handle standard progression based on result or status if needed, 
    // but typically the BGV generic form will just save data.
    if (bgv.overallResult === 'Discrepancy') {
      await advanceStep(req, tenantId, String(bgv.candidateId), 'bgvRequest', 'rejected', bgv._id as any);
    } else if (bgv.status === 'Completed' || bgv.overallResult === 'Clear') {
      await advanceStep(req, tenantId, String(bgv.candidateId), 'bgvRequest', 'completed', bgv._id as any);
    }

    await logAudit(tenantId, req.user!._id, 'UPDATE_BGV_REQUEST', req, { bgvId: id });
    res.status(200).json(bgv);
  } catch (error: any) {
    console.error('Error updating BGV request:', error);
    res.status(500).json({ message: 'Error updating BGV request' });
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

export const updateJoiningConfirmation = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const updated = await JoiningConfirmation.findOneAndUpdate({ _id: id, tenantId }, { $set: req.body }, { new: true });
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(updated);
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating', error: error.message });
  }
};

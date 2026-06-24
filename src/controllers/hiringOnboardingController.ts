import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { JoiningForm } from '../models/JoiningForm';
import { Nomination } from '../models/Nomination';
import { BankPayrollInfo } from '../models/BankPayrollInfo';
import { EmergencyContact } from '../models/EmergencyContact';
import { PolicyAcceptance } from '../models/PolicyAcceptance';
import { ConductAcceptance } from '../models/ConductAcceptance';
import { AssetAccessForm } from '../models/AssetAccessForm';
import { EngagementConfirmation } from '../models/EngagementConfirmation';
import { InductionForm } from '../models/InductionForm';
import { TeamIntro } from '../models/TeamIntro';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { Candidate } from '../models/Candidate';
import { advanceStep, linkEmployeeId } from '../utils/hiringPipelineHelpers';
import { generatePdfBuffer, savePdfToCloudinary } from '../utils/pdfGenerator';
import { getCompanyDocumentBranding } from '../utils/companyDocumentBranding';
import bcrypt from 'bcrypt';

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

// Step 9: Employee Joining Form
export const createJoiningForm = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const form = await JoiningForm.create({ ...req.body, tenantId, status: 'Submitted' });
    await advanceStep(req, tenantId, req.body.candidateId, 'joiningForm', 'completed', (form as any)._id);
    // This is the step where a candidate's pipeline becomes resolvable by employeeId too —
    // probationReview/performanceEval/idCard (steps 22-24) need it (see hiringGate.ts).
    if (req.body.employeeId) await linkEmployeeId(tenantId, req.body.candidateId, req.body.employeeId);
    await logAudit(tenantId, req.user!._id, 'CREATE_JOINING_FORM', req, { formId: (form as any)._id });
    res.status(201).json(form);
  } catch (error: any) {
    console.error('Error creating joining form:', error);
    res.status(500).json({ message: 'Error creating joining form' });
  }
};

export const getJoiningForms = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;
    const forms = await JoiningForm.find(filter).sort({ createdAt: -1 });
    res.status(200).json(forms);
  } catch (error: any) {
    console.error('Error fetching joining forms:', error);
    res.status(500).json({ message: 'Error fetching joining forms' });
  }
};

// Step 10: Nomination Form
export const createNomination = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    // Validate that nominee shares sum to exactly 100%
    const nominees: any[] = req.body.nominees || [];
    if (nominees.length > 0) {
      const totalShare = nominees.reduce((sum: number, n: any) => sum + (Number(n.sharePercentage) || 0), 0);
      if (Math.abs(totalShare - 100) > 0.01) {
        return res.status(400).json({ message: `Nominee share percentages must total 100%. Current total: ${totalShare}%` });
      }
    }

    const nomination = await Nomination.create({ ...req.body, tenantId, status: 'Submitted' });
    await advanceStep(req, tenantId, req.body.candidateId, 'nomination', 'completed', (nomination as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_NOMINATION', req, { nominationId: (nomination as any)._id });
    res.status(201).json(nomination);
  } catch (error: any) {
    console.error('Error creating nomination:', error);
    res.status(500).json({ message: 'Error creating nomination' });
  }
};

export const getNominations = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;
    const nominations = await Nomination.find(filter).sort({ createdAt: -1 });
    res.status(200).json(nominations);
  } catch (error: any) {
    console.error('Error fetching nominations:', error);
    res.status(500).json({ message: 'Error fetching nominations' });
  }
};

// Step 11: Bank & Payroll Information Form
export const createBankPayrollInfo = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const info = await BankPayrollInfo.create({ ...req.body, tenantId, status: 'Submitted' });
    await advanceStep(req, tenantId, req.body.candidateId, 'bankPayrollInfo', 'completed', (info as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_BANK_PAYROLL_INFO', req, { infoId: (info as any)._id });
    res.status(201).json(info);
  } catch (error: any) {
    console.error('Error creating bank/payroll info:', error);
    res.status(500).json({ message: 'Error creating bank/payroll info' });
  }
};

export const getBankPayrollInfos = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;
    // toJSON transform masks accountNumber/panNumber for all list/detail responses
    const infos = await BankPayrollInfo.find(filter).sort({ createdAt: -1 });
    res.status(200).json(infos);
  } catch (error: any) {
    console.error('Error fetching bank/payroll info:', error);
    res.status(500).json({ message: 'Error fetching bank/payroll info' });
  }
};

// Step 12: Emergency Contact Details Form
export const createEmergencyContact = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const contact = await EmergencyContact.create({ ...req.body, tenantId });
    await advanceStep(req, tenantId, req.body.candidateId, 'emergencyContact', 'completed', (contact as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_EMERGENCY_CONTACT', req, { contactId: (contact as any)._id });
    res.status(201).json(contact);
  } catch (error: any) {
    console.error('Error creating emergency contact:', error);
    res.status(500).json({ message: 'Error creating emergency contact' });
  }
};

export const getEmergencyContacts = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;
    const contacts = await EmergencyContact.find(filter).sort({ createdAt: -1 });
    res.status(200).json(contacts);
  } catch (error: any) {
    console.error('Error fetching emergency contacts:', error);
    res.status(500).json({ message: 'Error fetching emergency contacts' });
  }
};

// Step 15: IT Policy & IT Acceptance Form
export const createPolicyAcceptance = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const acceptance = await PolicyAcceptance.create({
      ...req.body, tenantId, status: 'Accepted', acceptedAt: new Date(), ipAddress: req.ip
    });
    await advanceStep(req, tenantId, req.body.candidateId, 'itPolicyAcceptance', 'approved', (acceptance as any)._id);
    await logAudit(tenantId, req.user!._id, 'ACCEPT_IT_POLICY', req, { acceptanceId: (acceptance as any)._id });
    res.status(201).json(acceptance);
  } catch (error: any) {
    console.error('Error creating policy acceptance:', error);
    res.status(500).json({ message: 'Error creating policy acceptance' });
  }
};

export const getPolicyAcceptances = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;
    const acceptances = await PolicyAcceptance.find(filter).sort({ createdAt: -1 });
    res.status(200).json(acceptances);
  } catch (error: any) {
    console.error('Error fetching policy acceptances:', error);
    res.status(500).json({ message: 'Error fetching policy acceptances' });
  }
};

// Step 16: Code of Conduct Acceptance
export const createConductAcceptance = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const acceptance = await ConductAcceptance.create({
      ...req.body, tenantId, status: 'Accepted', acceptedAt: new Date(), ipAddress: req.ip
    });
    await advanceStep(req, tenantId, req.body.candidateId, 'conductAcceptance', 'approved', (acceptance as any)._id);
    await logAudit(tenantId, req.user!._id, 'ACCEPT_CODE_OF_CONDUCT', req, { acceptanceId: (acceptance as any)._id });
    res.status(201).json(acceptance);
  } catch (error: any) {
    console.error('Error creating conduct acceptance:', error);
    res.status(500).json({ message: 'Error creating conduct acceptance' });
  }
};

export const getConductAcceptances = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;
    const acceptances = await ConductAcceptance.find(filter).sort({ createdAt: -1 });
    res.status(200).json(acceptances);
  } catch (error: any) {
    console.error('Error fetching conduct acceptances:', error);
    res.status(500).json({ message: 'Error fetching conduct acceptances' });
  }
};

// Step 18: IT Assets / IT Access / Stationery Form
export const createAssetAccessForm = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const form = await AssetAccessForm.create({ ...req.body, tenantId, issuedBy: req.user!._id, status: 'Issued' });
    await advanceStep(req, tenantId, req.body.candidateId, 'assetAccessForm', 'completed', (form as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_ASSET_ACCESS_FORM', req, { formId: (form as any)._id });
    res.status(201).json(form);
  } catch (error: any) {
    console.error('Error creating asset/access form:', error);
    res.status(500).json({ message: 'Error creating asset/access form' });
  }
};

export const getAssetAccessForms = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;
    const forms = await AssetAccessForm.find(filter).sort({ createdAt: -1 });
    res.status(200).json(forms);
  } catch (error: any) {
    console.error('Error fetching asset/access forms:', error);
    res.status(500).json({ message: 'Error fetching asset/access forms' });
  }
};

// Step 19: Engagement Confirmation Form
export const createEngagementConfirmation = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const confirmation = await EngagementConfirmation.create({
      ...req.body, tenantId, sentBy: req.user!._id, status: 'Sent'
    });
    await advanceStep(req, tenantId, req.body.candidateId, 'engagementConfirmation', 'completed', (confirmation as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_ENGAGEMENT_CONFIRMATION', req, { confirmationId: (confirmation as any)._id });
    res.status(201).json(confirmation);
  } catch (error: any) {
    console.error('Error creating engagement confirmation:', error);
    res.status(500).json({ message: 'Error creating engagement confirmation' });
  }
};

export const getEngagementConfirmations = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;
    const confirmations = await EngagementConfirmation.find(filter).sort({ createdAt: -1 });
    res.status(200).json(confirmations);
  } catch (error: any) {
    console.error('Error fetching engagement confirmations:', error);
    res.status(500).json({ message: 'Error fetching engagement confirmations' });
  }
};

// Step 20: Induction Form
export const createInductionForm = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const form = await InductionForm.create({ ...req.body, tenantId });
    await advanceStep(req, tenantId, req.body.candidateId, 'induction', 'in_progress', (form as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_INDUCTION_FORM', req, { formId: (form as any)._id });
    res.status(201).json(form);
  } catch (error: any) {
    console.error('Error creating induction form:', error);
    res.status(500).json({ message: 'Error creating induction form' });
  }
};

export const getInductionForms = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;
    const forms = await InductionForm.find(filter).sort({ createdAt: -1 });
    res.status(200).json(forms);
  } catch (error: any) {
    console.error('Error fetching induction forms:', error);
    res.status(500).json({ message: 'Error fetching induction forms' });
  }
};

export const updateInductionModule = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id, moduleIndex } = req.params;

    const form = await InductionForm.findOne({ _id: id, tenantId } as any);
    if (!form) return res.status(404).json({ message: 'Induction form not found' });

    const idx = parseInt(String(moduleIndex), 10);
    if (!form.modules[idx]) return res.status(404).json({ message: 'Induction module not found' });

    form.modules[idx].completed = true;
    form.modules[idx].completedDate = new Date();
    const allCompleted = form.modules.every(m => m.completed);
    form.overallStatus = allCompleted ? 'Completed' : 'InProgress';

    await form.save();

    if (allCompleted) {
      await advanceStep(req, tenantId, String(form.candidateId), 'induction', 'completed', form._id as any);
    }

    await logAudit(tenantId, req.user!._id, 'UPDATE_INDUCTION_MODULE', req, { formId: id, moduleIndex: idx });
    res.status(200).json(form);
  } catch (error: any) {
    console.error('Error updating induction module:', error);
    res.status(500).json({ message: 'Error updating induction module' });
  }
};

// Step 21: Team Introduction Note
export const createTeamIntro = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const intro = await TeamIntro.create({ ...req.body, tenantId, sentBy: req.user!._id, sentDate: new Date() });
    await advanceStep(req, tenantId, req.body.candidateId, 'teamIntro', 'completed', (intro as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_TEAM_INTRO', req, { introId: (intro as any)._id });
    res.status(201).json(intro);
  } catch (error: any) {
    console.error('Error creating team intro:', error);
    res.status(500).json({ message: 'Error creating team intro' });
  }
};

export const getTeamIntros = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;
    const intros = await TeamIntro.find(filter).sort({ createdAt: -1 });
    res.status(200).json(intros);
  } catch (error: any) {
    console.error('Error fetching team intros:', error);
    res.status(500).json({ message: 'Error fetching team intros' });
  }
};

// ── WP3 Action: Verify Joining Form ───────────────────────────────────────────
export const verifyJoiningForm = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const form = await JoiningForm.findOneAndUpdate(
      { _id: id, tenantId } as any,
      {
        status: 'Verified', approvalStatus: 'Verified',
        'declaration.hrVerifiedBy': req.body.hrVerifiedBy,
        'declaration.hrDesignation': req.body.hrDesignation,
        'declaration.hrDate': new Date(),
        'declaration.hrRemarks': req.body.hrRemarks,
      },
      { returnDocument: 'after' }
    );
    if (!form) return res.status(404).json({ message: 'Joining form not found' });

    // A verified joining form is the only candidate-to-employee handoff.
    // Re-use an already linked employee when this verification is retried.
    const candidate = await Candidate.findOne({ _id: form.candidateId, tenantId } as any);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found for joining form' });

    let employeeId = form.employeeId as any;
    let employeeCreated = false;
    if (!employeeId) {
      const existingEmployee = await User.findOne({ tenantId, email: candidate.email } as any);
      if (existingEmployee) {
        employeeId = existingEmployee._id;
      } else {
        const [firstName, ...rest] = String((form.personalDetails as any)?.fullName || `${candidate.firstName} ${candidate.lastName}`).trim().split(/\s+/);
        const position = form.positionDetails as any;
        const contact = form.contactDetails as any;
        const identity = form.identificationDetails as any;
        const emergency = form.emergencyContact as any;
        const employee = await User.create({
          tenantId,
          firstName: firstName || candidate.firstName,
          lastName: rest.join(' ') || candidate.lastName || 'Employee',
          email: candidate.email,
          passwordHash: await bcrypt.hash(`Joining-${String(candidate._id).slice(-8)}!`, 10),
          profilePictureUrl: candidate.profileImageUrl,
          employeeCode: position?.empCode || undefined,
          mobileNumber: contact?.mobileNumber || candidate.phone,
          dateOfJoining: position?.joiningDate || undefined,
          dateOfBirth: (form.personalDetails as any)?.dob || undefined,
          gender: String((form.personalDetails as any)?.gender || '').toLowerCase() || undefined,
          bloodGroup: (form.personalDetails as any)?.bloodGroup || undefined,
          maritalStatus: String((form.personalDetails as any)?.maritalStatus || '').toLowerCase() || undefined,
          currentAddress: contact?.currentAddress || undefined,
          permanentAddress: contact?.permanentAddress || undefined,
          panNumber: identity?.panNumber || undefined,
          aadhaarNumber: identity?.aadhaarNumber || undefined,
          uanNumber: identity?.uanNumber || undefined,
          emergencyContactName: emergency?.name || undefined,
          emergencyContactRelation: emergency?.relationship || undefined,
          emergencyContactNumber: emergency?.mobileNumber || undefined,
          employmentStatus: 'active',
          isActive: true,
          createdBy: req.user?._id,
        } as any);
        employeeId = employee._id;
        employeeCreated = true;
      }

      form.employeeId = employeeId;
      await form.save();
    }

    await linkEmployeeId(tenantId, String(form.candidateId), String(employeeId));
    await advanceStep(req, tenantId, String(form.candidateId), 'joiningForm', 'approved', form._id as any);
    await logAudit(tenantId, req.user!._id, 'VERIFY_JOINING_FORM', req, { formId: id, employeeId, employeeCreated });
    res.status(200).json({ form, employeeId });
  } catch (error: any) {
    console.error('Error verifying joining form:', error);
    res.status(500).json({ message: 'Error verifying joining form' });
  }
};

// ── WP3 Action: Generate Joining Form PDF ─────────────────────────────────────
export const generateJoiningFormPdf = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const form = await JoiningForm.findOne({ _id: id, tenantId } as any);
    if (!form) return res.status(404).json({ message: 'Joining form not found' });
    const candidate = await Candidate.findOne({ _id: form.candidateId, tenantId } as any);
    const branding = await getCompanyDocumentBranding(tenantId);
    const pd = form.personalDetails as any;
    const cd = form.contactDetails as any;
    const pos = form.positionDetails as any;
    const idf = form.identificationDetails as any;

    const eduRows = (form.educationDetails || []).flatMap((e: any, i: number) => [
      { label: `Education ${i + 1}: Qualification`, value: e.qualification || '—' },
      { label: `Education ${i + 1}: Institution`, value: e.institution || '—' },
      { label: `Education ${i + 1}: Year / Grade`, value: `${e.yearOfPassing || '—'} / ${e.percentage || '—'}` },
    ]);
    const empRows = (form.previousEmployment || []).flatMap((e: any, i: number) => [
      { label: `Employment ${i + 1}: Company`, value: e.companyName || '—' },
      { label: `Employment ${i + 1}: Designation`, value: e.designation || '—' },
      { label: `Employment ${i + 1}: Period`, value: `${e.fromDate ? new Date(e.fromDate).toDateString() : '—'} – ${e.toDate ? new Date(e.toDate).toDateString() : 'Present'}` },
      { label: `Employment ${i + 1}: Reason for Leaving`, value: e.reasonForLeaving || '—' },
    ]);

    const buffer = await generatePdfBuffer({
      ...branding,
      title: 'Employee Joining Form',
      recipientName: candidate ? `${candidate.firstName} ${candidate.lastName}` : pd?.fullName,
      lines: [
        // Personal
        { label: 'Full Name', value: pd?.fullName || '—' },
        { label: 'Date of Birth', value: pd?.dob ? new Date(pd.dob).toDateString() : '—' },
        { label: 'Gender', value: pd?.gender || '—' },
        { label: 'Blood Group', value: pd?.bloodGroup || '—' },
        { label: 'Marital Status', value: pd?.maritalStatus || '—' },
        { label: 'Nationality', value: pd?.nationality || '—' },
        { label: 'Father / Mother', value: pd?.fatherMotherName || '—' },
        // Contact
        { label: 'Mobile', value: cd?.mobileNumber || '—' },
        { label: 'Personal Email', value: cd?.personalEmail || '—' },
        { label: 'Current Address', value: cd?.currentAddress || '—' },
        { label: 'Permanent Address', value: cd?.permanentAddress || '—' },
        // Position
        { label: 'Designation', value: pos?.designation || '—' },
        { label: 'Department', value: pos?.department || '—' },
        { label: 'Joining Date', value: pos?.joiningDate ? new Date(pos.joiningDate).toDateString() : '—' },
        { label: 'Employee Category', value: pos?.employeeCategory || '—' },
        { label: 'Work Location', value: pos?.workLocation || '—' },
        { label: 'Employee Code', value: pos?.empCode || '—' },
        // Identification (masked)
        { label: 'PAN', value: idf?.panNumber ? `XXXXX${String(idf.panNumber).slice(-4)}` : '—' },
        { label: 'Aadhaar', value: idf?.aadhaarNumber ? `XXXX XXXX ${String(idf.aadhaarNumber).slice(-4)}` : '—' },
        { label: 'UAN', value: idf?.uanNumber || '—' },
        { label: 'PF Number', value: idf?.pfNumber || '—' },
        // Education
        ...(eduRows.length > 0 ? [{ value: '\n— Education Details —' }, ...eduRows] : []),
        // Employment
        ...(empRows.length > 0 ? [{ value: '\n— Previous Employment —' }, ...empRows] : []),
        // Status
        { label: 'Form Status', value: (form as any).approvalStatus || '—' },
        // Declaration
        { value: '\n\nDeclaration: I hereby declare that the information provided above is true and correct to the best of my knowledge.\n\nEmployee Signature: ________________________    Date: ________________________\n\nHR Verified By: ________________________    Designation: ________________________    Date: ________________________' },
      ],
      footerNote: branding.footerNote,
    });

    const pdfUrl = await savePdfToCloudinary(buffer, `joining-form-${id}.pdf`);
    (form as any).pdfUrl = pdfUrl;
    await (form as any).save();
    await logAudit(tenantId, req.user!._id, 'GENERATE_JOINING_FORM_PDF', req, { formId: id });
    res.status(200).json({ pdfUrl, form });
  } catch (error: any) {
    console.error('Error generating joining form PDF:', error);
    res.status(500).json({ message: 'Error generating joining form PDF' });
  }
};

// ── WP3 Action: Verify Nomination ─────────────────────────────────────────────
export const verifyNomination = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const nom = await Nomination.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { status: 'Verified', hrVerifiedBy: req.body.hrVerifiedBy, hrVerifiedDate: new Date(), hrRemarks: req.body.hrRemarks },
      { returnDocument: 'after' }
    );
    if (!nom) return res.status(404).json({ message: 'Nomination not found' });
    await advanceStep(req, tenantId, String(nom.candidateId), 'nomination', 'approved', nom._id as any);
    await logAudit(tenantId, req.user!._id, 'VERIFY_NOMINATION', req, { nominationId: id });
    res.status(200).json(nom);
  } catch (error: any) {
    console.error('Error verifying nomination:', error);
    res.status(500).json({ message: 'Error verifying nomination' });
  }
};

// ── WP3 Action: Generate Nomination PDF ───────────────────────────────────────
export const generateNominationPdf = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const nom = await Nomination.findOne({ _id: id, tenantId } as any);
    if (!nom) return res.status(404).json({ message: 'Nomination not found' });
    const candidate = await Candidate.findOne({ _id: nom.candidateId, tenantId } as any);
    const branding = await getCompanyDocumentBranding(tenantId);
    const nominees = (nom.nominees || []);
    const totalShare = nominees.reduce((s: number, n: any) => s + (n.sharePercentage || 0), 0);

    const buffer = await generatePdfBuffer({
      ...branding,
      title: `Nomination Form — ${nom.nominationType}`,
      recipientName: candidate ? `${candidate.firstName} ${candidate.lastName}` : undefined,
      lines: [
        { label: 'Nomination Type', value: nom.nominationType },
        { label: 'Total Share Allocated', value: `${totalShare}%` },
        ...nominees.flatMap((n: any, i: number) => ([
          { label: `Nominee ${i + 1}`, value: n.name },
          { label: 'Relationship', value: n.relationship || '—' },
          { label: 'DOB', value: n.dob ? new Date(n.dob).toDateString() : '—' },
          { label: 'Share %', value: `${n.sharePercentage || 0}%` },
          { label: 'Minor', value: n.isMinor ? `Yes — Guardian: ${n.guardianName || '—'}` : 'No' },
        ])),
        { value: '\n\nDeclaration: I hereby nominate the above person(s).\n\nEmployee Signature: ________________________    Date: ________________________\n\nWitness: ________________________    HR Verification: ________________________' },
      ],
      footerNote: branding.footerNote,
    });

    const pdfUrl = await savePdfToCloudinary(buffer, `nomination-${id}.pdf`);
    (nom as any).pdfUrl = pdfUrl;
    await nom.save();
    await logAudit(tenantId, req.user!._id, 'GENERATE_NOMINATION_PDF', req, { nominationId: id });
    res.status(200).json({ pdfUrl, nom });
  } catch (error: any) {
    console.error('Error generating nomination PDF:', error);
    res.status(500).json({ message: 'Error generating nomination PDF' });
  }
};

// ── WP3 Action: Verify Bank & Payroll ─────────────────────────────────────────
export const verifyBankPayrollInfo = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const info = await BankPayrollInfo.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { status: 'Verified', hrVerifiedBy: req.body.hrVerifiedBy, hrVerifiedDate: new Date(), hrRemarks: req.body.hrRemarks },
      { returnDocument: 'after' }
    );
    if (!info) return res.status(404).json({ message: 'Bank/payroll record not found' });
    await advanceStep(req, tenantId, String(info.candidateId), 'bankPayrollInfo', 'approved', info._id as any);
    await logAudit(tenantId, req.user!._id, 'VERIFY_BANK_PAYROLL', req, { infoId: id });
    res.status(200).json(info);
  } catch (error: any) {
    console.error('Error verifying bank/payroll info:', error);
    res.status(500).json({ message: 'Error verifying bank/payroll info' });
  }
};

// ── WP3 Action: Generate Bank & Payroll PDF ───────────────────────────────────
export const generateBankPayrollPdf = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const info = await BankPayrollInfo.findOne({ _id: id, tenantId } as any);
    if (!info) return res.status(404).json({ message: 'Bank/payroll record not found' });
    const candidate = await Candidate.findOne({ _id: info.candidateId, tenantId } as any);
    const branding = await getCompanyDocumentBranding(tenantId);

    const buffer = await generatePdfBuffer({
      ...branding,
      title: 'Bank & Payroll Information',
      recipientName: candidate ? `${candidate.firstName} ${candidate.lastName}` : undefined,
      lines: [
        { label: 'Bank Name', value: info.bankName },
        { label: 'Account Holder', value: info.accountHolderName },
        { label: 'Account Number', value: `XXXXXX${(info as any).getDecryptedAccountNumber?.().slice(-4) || '****'}` },
        { label: 'IFSC Code', value: info.ifscCode },
        { label: 'Branch', value: info.branchName || '—' },
        { label: 'Account Type', value: info.accountType },
        { label: 'PAN', value: `XXXXX${(info as any).getDecryptedPan?.()?.slice(-4) || '****'}` },
        { label: 'UAN', value: info.uanNumber || '—' },
        { label: 'Payment Mode', value: (info as any).paymentMode || '—' },
        { label: 'PF Applicable', value: (info as any).pfApplicable ? 'Yes' : 'No' },
        { label: 'ESI Applicable', value: (info as any).esiApplicable ? 'Yes' : 'No' },
        { label: 'Status', value: info.status },
        { value: '\n\nEmployee Declaration: I hereby declare the above details are correct.\n\nEmployee Signature: ________________________    Date: ________________________\n\nHR Verification: ________________________    Date: ________________________' },
      ],
      footerNote: branding.footerNote,
    });

    const pdfUrl = await savePdfToCloudinary(buffer, `bank-payroll-${id}.pdf`);
    (info as any).pdfUrl = pdfUrl;
    await (info as any).save();
    await logAudit(tenantId, req.user!._id, 'GENERATE_BANK_PAYROLL_PDF', req, { infoId: id });
    res.status(200).json({ pdfUrl, info });
  } catch (error: any) {
    console.error('Error generating bank/payroll PDF:', error);
    res.status(500).json({ message: 'Error generating bank/payroll PDF' });
  }
};

// ── WP3 Action: Verify Emergency Contact ──────────────────────────────────────
export const verifyEmergencyContact = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const contact = await EmergencyContact.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { status: 'Verified', hrVerifiedBy: req.body.hrVerifiedBy, hrVerifiedDate: new Date(), hrRemarks: req.body.hrRemarks },
      { returnDocument: 'after' }
    );
    if (!contact) return res.status(404).json({ message: 'Emergency contact not found' });
    await advanceStep(req, tenantId, String(contact.candidateId), 'emergencyContact', 'approved', contact._id as any);
    await logAudit(tenantId, req.user!._id, 'VERIFY_EMERGENCY_CONTACT', req, { contactId: id });
    res.status(200).json(contact);
  } catch (error: any) {
    console.error('Error verifying emergency contact:', error);
    res.status(500).json({ message: 'Error verifying emergency contact' });
  }
};

// ── WP3 Action: Generate Policy Acceptance PDF ────────────────────────────────
export const generatePolicyAcceptancePdf = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const acc = await PolicyAcceptance.findOne({ _id: id, tenantId } as any);
    if (!acc) return res.status(404).json({ message: 'Policy acceptance not found' });
    const branding = await getCompanyDocumentBranding(tenantId);

    const buffer = await generatePdfBuffer({
      ...branding,
      title: `IT Policy Acknowledgement${acc.policyTitle ? ` — ${acc.policyTitle}` : ''}`,
      lines: [
        { label: 'Policy Version', value: acc.policyVersion || '—' },
        { label: 'Signer', value: acc.signerName || '—' },
        { label: 'Designation', value: acc.signerDesignation || '—' },
        { label: 'Accepted At', value: acc.acceptedAt ? new Date(acc.acceptedAt).toLocaleString() : '—' },
        { value: acc.policyContentSnapshot || 'Refer to the company IT Policy document.' },
        { value: '\n\nI acknowledge that I have read, understood and agree to comply with the IT Policy.\n\nSignature: ________________________    Date: ________________________' },
      ],
      footerNote: branding.footerNote,
    });

    const pdfUrl = await savePdfToCloudinary(buffer, `it-policy-accept-${id}.pdf`);
    (acc as any).pdfUrl = pdfUrl;
    await (acc as any).save();
    await logAudit(tenantId, req.user!._id, 'GENERATE_POLICY_ACCEPTANCE_PDF', req, { acceptanceId: id });
    res.status(200).json({ pdfUrl, acc });
  } catch (error: any) {
    console.error('Error generating policy acceptance PDF:', error);
    res.status(500).json({ message: 'Error generating policy acceptance PDF' });
  }
};

// ── WP3 Action: Generate Conduct Acceptance PDF ───────────────────────────────
export const generateConductAcceptancePdf = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const acc = await ConductAcceptance.findOne({ _id: id, tenantId } as any);
    if (!acc) return res.status(404).json({ message: 'Conduct acceptance not found' });
    const branding = await getCompanyDocumentBranding(tenantId);

    const buffer = await generatePdfBuffer({
      ...branding,
      title: `Code of Conduct Acknowledgement${acc.conductTitle ? ` — ${acc.conductTitle}` : ''}`,
      lines: [
        { label: 'Version', value: acc.version || '—' },
        { label: 'Signer', value: acc.signerName || '—' },
        { label: 'Designation', value: acc.signerDesignation || '—' },
        { label: 'Accepted At', value: acc.acceptedAt ? new Date(acc.acceptedAt).toLocaleString() : '—' },
        { value: acc.conductContentSnapshot || 'Refer to the company Code of Conduct document.' },
        { value: '\n\nI acknowledge that I have read, understood and agree to abide by the Code of Conduct.\n\nSignature: ________________________    Date: ________________________' },
      ],
      footerNote: branding.footerNote,
    });

    const pdfUrl = await savePdfToCloudinary(buffer, `conduct-accept-${id}.pdf`);
    (acc as any).pdfUrl = pdfUrl;
    await (acc as any).save();
    await logAudit(tenantId, req.user!._id, 'GENERATE_CONDUCT_ACCEPTANCE_PDF', req, { acceptanceId: id });
    res.status(200).json({ pdfUrl, acc });
  } catch (error: any) {
    console.error('Error generating conduct acceptance PDF:', error);
    res.status(500).json({ message: 'Error generating conduct acceptance PDF' });
  }
};


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
import { AuditLog } from '../models/AuditLog';
import { advanceStep, linkEmployeeId } from '../utils/hiringPipelineHelpers';

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

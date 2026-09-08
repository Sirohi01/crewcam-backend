import mongoose from 'mongoose';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ProbationReview } from '../models/ProbationReview';
import { HiringPerformanceEval } from '../models/HiringPerformanceEval';
import { IDCard } from '../models/IDCard';
import { ReleaseQA } from '../models/ReleaseQA';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { HiringPipelineState } from '../models/HiringPipelineState';
import { generatePdfBuffer, savePdfToCloudinary } from '../utils/pdfGenerator';
import { generateIdCardPdfBuffer } from '../utils/idCardPdfGenerator';
import { getCompanyDocumentBranding } from '../utils/companyDocumentBranding';
import { advanceStepForEmployee } from '../utils/hiringPipelineHelpers';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Tenant } from '../models/Tenant';
import { sendMail, buildEmployeeWelcomeEmail } from '../services/mailer';

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

const resolveEmployeeId = async (tenantId: any, employeeIdInput: any) => {
  if (!employeeIdInput) return null;
  const str = String(employeeIdInput).trim();
  if (mongoose.Types.ObjectId.isValid(str) && /^[0-9a-fA-F]{24}$/.test(str)) {
    return new mongoose.Types.ObjectId(str);
  }
  const user = await User.findOne({ tenantId, employeeCode: str });
  if (user) return user._id;
  const state = await HiringPipelineState.findOne({ tenantId, $or: [{ employeeId: str }, { candidateId: str }] } as any);
  if (state?.employeeId && mongoose.Types.ObjectId.isValid(String(state.employeeId))) {
    return state.employeeId;
  }
  return null;
};

// Step 22: Probation Review Form
export const createProbationReview = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const employeeId = await resolveEmployeeId(tenantId, req.body.employeeId);
    if (!employeeId) return res.status(400).json({ message: 'Valid employee ID required' });

    const ratings = req.body.ratings || [];
    const overallRating = ratings.length
      ? ratings.reduce((sum: number, r: any) => sum + (r.score || 0), 0) / ratings.length
      : undefined;

    const review = await ProbationReview.create({
      ...req.body,
      employeeId,
      tenantId,
      reviewerId: req.user!._id,
      overallRating,
      reviewDate: new Date()
    });

    await advanceStepForEmployee(req, tenantId, String(employeeId), 'probationReview', 'in_progress', (review as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_PROBATION_REVIEW', req, { reviewId: (review as any)._id });
    res.status(201).json(review);
  } catch (error: any) {
    console.error('Error creating probation review:', error);
    res.status(500).json({ message: 'Error creating probation review', error: error.message });
  }
};

export const getProbationReviews = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { employeeId } = req.query;
    const filter: any = { tenantId };
    if (employeeId) filter.employeeId = employeeId;

    const reviews = await ProbationReview.find(filter)
      .populate('reviewerId', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.status(200).json(reviews);
  } catch (error: any) {
    console.error('Error fetching probation reviews:', error);
    res.status(500).json({ message: 'Error fetching probation reviews' });
  }
};

export const updateProbationDecision = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const { decision, extensionMonths, comments } = req.body;

    const review = await ProbationReview.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { decision, extensionMonths, comments },
      { returnDocument: 'after' }
    );
    if (!review) return res.status(404).json({ message: 'Probation review not found' });

    if (decision === 'Confirmed' || decision === 'Extended') {
      await advanceStepForEmployee(req, tenantId, String(review.employeeId), 'probationReview', 'completed', review._id as any);
    } else if (decision === 'Terminated') {
      // Terminal-negative: no further onboarding steps (performance eval, ID card) apply.
      await advanceStepForEmployee(req, tenantId, String(review.employeeId), 'probationReview', 'rejected', review._id as any);
    }

    await logAudit(tenantId, req.user!._id, 'UPDATE_PROBATION_DECISION', req, { reviewId: id, decision });
    res.status(200).json(review);
  } catch (error: any) {
    console.error('Error updating probation decision:', error);
    res.status(500).json({ message: 'Error updating probation decision' });
  }
};

export const deleteProbationReview = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const review = await ProbationReview.findOneAndDelete({ _id: req.params.id, tenantId } as any);
    if (!review) return res.status(404).json({ message: 'Probation review not found' });

    await logAudit(tenantId, req.user!._id, 'DELETE_PROBATION_REVIEW', req, { reviewId: req.params.id });
    res.status(200).json({ message: 'Probation review deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting probation review:', error);
    res.status(500).json({ message: 'Error deleting probation review' });
  }
};

export const updateProbationReview = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const ratings = req.body.ratings || [];
    const overallRating = ratings.length
      ? ratings.reduce((sum: number, r: any) => sum + (r.score || 0), 0) / ratings.length
      : undefined;

    const review = await ProbationReview.findOneAndUpdate(
      { _id: req.params.id, tenantId } as any,
      { $set: { ...req.body, overallRating } },
      { returnDocument: 'after' }
    );

    if (!review) return res.status(404).json({ message: 'Probation review not found' });
    await logAudit(tenantId, req.user!._id, 'UPDATE_PROBATION_REVIEW', req, { reviewId: req.params.id });
    res.status(200).json(review);
  } catch (error: any) {
    console.error('Error updating probation review:', error);
    res.status(500).json({ message: 'Error updating probation review' });
  }
};

// Step 23: Employee Performance Evaluation Sheet
export const createHiringPerformanceEval = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const employeeId = await resolveEmployeeId(tenantId, req.body.employeeId);
    if (!employeeId) return res.status(400).json({ message: 'Valid employee ID required' });

    const kpis = req.body.kpis || [];
    const overallScore = kpis.length
      ? kpis.reduce((sum: number, k: any) => sum + (k.score || 0), 0) / kpis.length
      : undefined;

    const evaluation = await HiringPerformanceEval.create({
      ...req.body,
      employeeId,
      tenantId,
      evaluatorId: req.user!._id,
      overallScore,
      reviewDate: new Date()
    });

    await advanceStepForEmployee(req, tenantId, String(employeeId), 'performanceEval', 'completed', (evaluation as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_HIRING_PERFORMANCE_EVAL', req, { evalId: (evaluation as any)._id });
    res.status(201).json(evaluation);
  } catch (error: any) {
    console.error('Error creating performance evaluation:', error);
    res.status(500).json({ message: 'Error creating performance evaluation', error: error.message });
  }
};

export const updateHiringPerformanceEval = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const kpis = req.body.kpis || [];
    const overallScore = kpis.length
      ? kpis.reduce((sum: number, k: any) => sum + (k.score || 0), 0) / kpis.length
      : undefined;

    const evaluation = await HiringPerformanceEval.findOneAndUpdate(
      { _id: req.params.id, tenantId } as any,
      { $set: { ...req.body, overallScore } },
      { returnDocument: 'after' }
    );
    if (!evaluation) return res.status(404).json({ message: 'Performance evaluation not found' });
    res.status(200).json(evaluation);
  } catch (error: any) {
    console.error('Error updating performance evaluation:', error);
    res.status(500).json({ message: 'Error updating performance evaluation' });
  }
};

export const deleteHiringPerformanceEval = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const evaluation = await HiringPerformanceEval.findOneAndDelete({ _id: req.params.id, tenantId } as any);
    if (!evaluation) return res.status(404).json({ message: 'Performance evaluation not found' });
    res.status(200).json({ message: 'Performance evaluation deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting performance evaluation:', error);
    res.status(500).json({ message: 'Error deleting performance evaluation' });
  }
};

export const getHiringPerformanceEvals = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { employeeId } = req.query;
    const filter: any = { tenantId };
    if (employeeId) filter.employeeId = employeeId;

    const evaluations = await HiringPerformanceEval.find(filter)
      .populate('evaluatorId', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.status(200).json(evaluations);
  } catch (error: any) {
    console.error('Error fetching performance evaluations:', error);
    res.status(500).json({ message: 'Error fetching performance evaluations' });
  }
};

// Step 24: Visiting Card / ID Card
export const createIDCard = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const employeeId = await resolveEmployeeId(tenantId, req.body.employeeId);
    if (!employeeId) return res.status(400).json({ message: 'Valid employee ID required' });

    const card = await IDCard.create({ ...req.body, employeeId, tenantId, issuedBy: req.user!._id });
    await advanceStepForEmployee(req, tenantId, String(employeeId), 'idCard', 'in_progress', (card as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_ID_CARD', req, { cardId: (card as any)._id });
    res.status(201).json(card);
  } catch (error: any) {
    console.error('Error creating ID card:', error);
    res.status(500).json({ message: 'Error creating ID card', error: error.message });
  }
};

export const getIDCards = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { employeeId } = req.query;
    const filter: any = { tenantId };
    if (employeeId) filter.employeeId = employeeId;

    const cards = await IDCard.find(filter).sort({ createdAt: -1 });
    res.status(200).json(cards);
  } catch (error: any) {
    console.error('Error fetching ID cards:', error);
    res.status(500).json({ message: 'Error fetching ID cards' });
  }
};

export const updateIDCard = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const card = await IDCard.findOneAndUpdate(
      { _id: req.params.id, tenantId } as any,
      { $set: req.body },
      { returnDocument: 'after' }
    );
    if (!card) return res.status(404).json({ message: 'ID card not found' });
    
    await logAudit(tenantId, req.user!._id, 'UPDATE_ID_CARD', req, { cardId: req.params.id });
    res.status(200).json(card);
  } catch (error: any) {
    console.error('Error updating ID card:', error);
    res.status(500).json({ message: 'Error updating ID card' });
  }
};

export const deleteIDCard = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const card = await IDCard.findOneAndDelete({ _id: req.params.id, tenantId } as any);
    if (!card) return res.status(404).json({ message: 'ID card not found' });

    await logAudit(tenantId, req.user!._id, 'DELETE_ID_CARD', req, { cardId: req.params.id });
    res.status(200).json({ message: 'ID card deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting ID card:', error);
    res.status(500).json({ message: 'Error deleting ID card' });
  }
};

export const generateIDCardPdf = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    const card = await IDCard.findOne({ _id: id, tenantId } as any);
    if (!card) return res.status(404).json({ message: 'ID card not found' });

    const employee = await User.findOne({ _id: card.employeeId, tenantId } as any);
    const branding = await getCompanyDocumentBranding(tenantId);

    const qrPayload = card.qrPayload || JSON.stringify({ employeeId: String(card.employeeId), employeeCode: card.employeeCode || employee?.employeeCode || '', company: branding.companyName });
    const buffer = await generateIdCardPdfBuffer({
      companyName: branding.companyName,
      employeeName: employee ? `${employee.firstName} ${employee.lastName}` : 'Employee',
      employeeCode: card.employeeCode || employee?.employeeCode || '',
      designation: card.designation || '',
      ...(card.bloodGroup ? { bloodGroup: card.bloodGroup } : {}),
      ...(card.validTo ? { validTo: card.validTo } : {}),
      cardType: card.cardType,
      theme: card.cardTheme || '#0e4778',
      frontLabel: card.frontLabel || 'EMPLOYEE IDENTITY CARD',
      backNote: card.backNote || 'Scan this QR code to verify employee identity.',
      qrPayload,
    });

    const pdfUrl = await savePdfToCloudinary(buffer, `idcard-${id}.pdf`);
    card.pdfUrl = pdfUrl;
    card.qrPayload = qrPayload;
    card.status = 'Generated';
    await card.save();

    await advanceStepForEmployee(req, tenantId, String(card.employeeId), 'idCard', 'completed', card._id as any);

    await logAudit(tenantId, req.user!._id, 'GENERATE_ID_CARD_PDF', req, { cardId: id });
    res.status(200).json({ pdfUrl, card });
  } catch (error: any) {
    console.error('Error generating ID card PDF:', error);
    res.status(500).json({ message: 'Error generating ID card PDF' });
  }
};

export const markIDCardIssued = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    const card = await IDCard.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { status: 'Issued', issuedDate: new Date() },
      { returnDocument: 'after' }
    );
    if (!card) return res.status(404).json({ message: 'ID card not found' });

    // Step 24 marks the final completion of the entire 24-step hiring pipeline.
    // We generate the final login credentials and send the welcome email here.
    const employee = await User.findOne({ _id: card.employeeId, tenantId } as any);
    if (employee) {
      const generatedPassword = crypto.randomBytes(6).toString('hex') + 'A1!';
      employee.passwordHash = await bcrypt.hash(generatedPassword, 10);
      await employee.save();

      try {
        const tenant = await Tenant.findById(tenantId);
        const companyName = tenant?.name || 'Your Company';
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const loginUrl = `${frontendUrl}/login`;

        const emailContent = buildEmployeeWelcomeEmail({
          companyName,
          firstName: employee.firstName,
          email: employee.email,
          password: generatedPassword,
          loginUrl
        });
        await sendMail({ to: employee.email, ...emailContent });
      } catch (mailError) {
        console.error('Failed to send welcome email at Step 24:', mailError);
      }
    }

    await advanceStepForEmployee(req, tenantId, String(card.employeeId), 'idCard', 'approved', card._id as any);

    await logAudit(tenantId, req.user!._id, 'MARK_ID_CARD_ISSUED', req, { cardId: id });
    res.status(200).json(card);
  } catch (error: any) {
    console.error('Error marking ID card issued:', error);
    res.status(500).json({ message: 'Error marking ID card issued' });
  }
};

// Step 25: Release QA Checks
export const createReleaseQA = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const qa = await ReleaseQA.create({ ...req.body, tenantId, checkedBy: req.user!._id });
    await advanceStepForEmployee(req, tenantId, req.body.employeeId, 'releaseQA', 'in_progress', (qa as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_RELEASE_QA', req, { qaId: (qa as any)._id });
    res.status(201).json(qa);
  } catch (error: any) {
    console.error('Error creating release QA:', error);
    res.status(500).json({ message: 'Error creating release QA' });
  }
};

export const getReleaseQAs = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { employeeId } = req.query;
    const filter: any = { tenantId };
    if (employeeId) filter.employeeId = employeeId;

    const qas = await ReleaseQA.find(filter).sort({ createdAt: -1 });
    res.status(200).json(qas);
  } catch (error: any) {
    console.error('Error fetching release QAs:', error);
    res.status(500).json({ message: 'Error fetching release QAs' });
  }
};

export const updateReleaseQA = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const qa = await ReleaseQA.findOneAndUpdate(
      { _id: req.params.id, tenantId } as any,
      { $set: req.body },
      { returnDocument: 'after' }
    );
    if (!qa) return res.status(404).json({ message: 'Release QA not found' });
    
    // Auto-advance if Passed
    if (qa.qaStatus === 'Passed') {
      await advanceStepForEmployee(req, tenantId, String(qa.employeeId), 'releaseQA', 'completed', qa._id as any);
    } else if (qa.qaStatus === 'Failed') {
      await advanceStepForEmployee(req, tenantId, String(qa.employeeId), 'releaseQA', 'rejected', qa._id as any);
    }

    await logAudit(tenantId, req.user!._id, 'UPDATE_RELEASE_QA', req, { qaId: req.params.id });
    res.status(200).json(qa);
  } catch (error: any) {
    console.error('Error updating release QA:', error);
    res.status(500).json({ message: 'Error updating release QA' });
  }
};

export const deleteReleaseQA = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const qa = await ReleaseQA.findOneAndDelete({ _id: req.params.id, tenantId } as any);
    if (!qa) return res.status(404).json({ message: 'Release QA not found' });

    await logAudit(tenantId, req.user!._id, 'DELETE_RELEASE_QA', req, { qaId: req.params.id });
    res.status(200).json({ message: 'Release QA deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting release QA:', error);
    res.status(500).json({ message: 'Error deleting release QA' });
  }
};

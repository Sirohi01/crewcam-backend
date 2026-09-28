import mongoose from 'mongoose';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ProbationReview } from '../models/ProbationReview';
import { HiringPerformanceEval } from '../models/HiringPerformanceEval';
import { IDCard } from '../models/IDCard';
import { ReleaseQA } from '../models/ReleaseQA';
import { User } from '../models/User';
import { Candidate } from '../models/Candidate';
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
import { JoiningForm } from '../models/JoiningForm';
import { EmergencyContact } from '../models/EmergencyContact';
import { ManpowerRequest } from '../models/ManpowerRequest';
import { JoiningConfirmation } from '../models/JoiningConfirmation';
import { AppointmentLetter } from '../models/AppointmentLetter';

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

const resolveCanonicalCodeForEmployee = async (tenantId: any, employeeId: any, fallbackUniqueId?: string): Promise<string | undefined> => {
  if (!employeeId) return fallbackUniqueId;
  const user = await User.findOne({ _id: employeeId, tenantId }).lean();
  const state = await HiringPipelineState.findOne({ tenantId, employeeId }).lean();
  let candidate: any = null;
  if (state?.candidateId) {
    candidate = await Candidate.findOne({ _id: state.candidateId, tenantId }).lean();
  } else if (user?.email) {
    candidate = await Candidate.findOne({ tenantId, email: user.email }).lean();
  }
  const canonical = candidate?.candidateCode || candidate?.uniqueId || candidate?.employeeCode || (user?.employeeCode && !user.employeeCode.startsWith('EMP-') ? user.employeeCode : undefined) || fallbackUniqueId;

  if (canonical) {
    if (user && user.employeeCode !== canonical) {
      await User.updateOne({ _id: user._id }, { employeeCode: canonical });
    }
    if (candidate && (candidate.candidateCode !== canonical || candidate.uniqueId !== canonical || candidate.employeeCode !== canonical)) {
      await Candidate.updateOne({ _id: candidate._id }, { candidateCode: canonical, uniqueId: canonical, employeeCode: canonical });
    }
  }

  return canonical;
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
  const candidate = await Candidate.findOne({ tenantId, $or: [{ candidateCode: str }, { uniqueId: str }, { employeeCode: str }] } as any);
  if (candidate) {
    const candState = await HiringPipelineState.findOne({ tenantId, candidateId: candidate._id } as any);
    if (candState?.employeeId && mongoose.Types.ObjectId.isValid(String(candState.employeeId))) {
      return candState.employeeId;
    }
    const candUser = await User.findOne({ tenantId, email: candidate.email } as any);
    if (candUser) return candUser._id;
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

    const canonicalCode = await resolveCanonicalCodeForEmployee(tenantId, employeeId, req.body.uniqueId);

    const review = await ProbationReview.create({
      ...req.body,
      employeeId,
      tenantId,
      reviewerId: req.user!._id,
      overallRating,
      uniqueId: canonicalCode || req.body.uniqueId,
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
      .populate('employeeId', 'firstName lastName email employeeCode')
      .sort({ createdAt: -1 });

    const sanitized = reviews.map((r: any) => {
      const doc = r.toObject ? r.toObject() : { ...r };
      const empCode = doc.employeeId?.employeeCode;
      if (empCode && (!doc.uniqueId || doc.uniqueId.startsWith('EMP-'))) {
        doc.uniqueId = empCode;
      }
      return doc;
    });
    res.status(200).json(sanitized);
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

    const existing = await ProbationReview.findOne({ _id: req.params.id, tenantId } as any);
    const canonicalCode = await resolveCanonicalCodeForEmployee(tenantId, existing?.employeeId, req.body.uniqueId);

    const review = await ProbationReview.findOneAndUpdate(
      { _id: req.params.id, tenantId } as any,
      { $set: { ...req.body, overallRating, ...(canonicalCode ? { uniqueId: canonicalCode } : {}) } },
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

    const canonicalCode = await resolveCanonicalCodeForEmployee(tenantId, employeeId, req.body.uniqueId);

    const evaluation = await HiringPerformanceEval.create({
      ...req.body,
      employeeId,
      tenantId,
      evaluatorId: req.user!._id,
      overallScore,
      uniqueId: canonicalCode || req.body.uniqueId,
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

    const existing = await HiringPerformanceEval.findOne({ _id: req.params.id, tenantId } as any);
    const canonicalCode = await resolveCanonicalCodeForEmployee(tenantId, existing?.employeeId, req.body.uniqueId);

    const evaluation = await HiringPerformanceEval.findOneAndUpdate(
      { _id: req.params.id, tenantId } as any,
      { $set: { ...req.body, overallScore, ...(canonicalCode ? { uniqueId: canonicalCode } : {}) } },
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
      .populate('employeeId', 'firstName lastName email employeeCode')
      .sort({ createdAt: -1 });

    const sanitized = evaluations.map((e: any) => {
      const doc = e.toObject ? e.toObject() : { ...e };
      const empCode = doc.employeeId?.employeeCode;
      if (empCode && (!doc.uniqueId || doc.uniqueId.startsWith('EMP-'))) {
        doc.uniqueId = empCode;
      }
      return doc;
    });
    res.status(200).json(sanitized);
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

    const canonicalCode = await resolveCanonicalCodeForEmployee(tenantId, employeeId, req.body.employeeCode);

    const card = await IDCard.create({
      ...req.body,
      employeeId,
      tenantId,
      employeeCode: canonicalCode || req.body.employeeCode,
      issuedBy: req.user!._id
    });
    await advanceStepForEmployee(req, tenantId, String(employeeId), 'idCard', 'in_progress', (card as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_ID_CARD', req, { cardId: (card as any)._id });
    res.status(201).json(card);
  } catch (error: any) {
    console.error('Error creating ID card:', error);
    res.status(500).json({ message: 'Error creating ID card', error: error.message });
  }
};

const formatDateStr = (val: any) => {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getEnrichedIdCardDetails = async (tenantId: any, candidateId?: string, employeeId?: string) => {
  let candidate: any = null;
  let user: any = null;
  let state: any = null;

  if (candidateId) {
    if (mongoose.Types.ObjectId.isValid(candidateId)) {
      candidate = await Candidate.findOne({ _id: candidateId, tenantId }).lean();
    }
    if (!candidate) {
      candidate = await Candidate.findOne({
        tenantId,
        $or: [{ candidateCode: candidateId }, { uniqueId: candidateId }, { employeeCode: candidateId }]
      }).lean();
    }
    if (!candidate && mongoose.Types.ObjectId.isValid(candidateId)) {
      user = await User.findOne({ _id: candidateId, tenantId }).lean();
      if (user) {
        state = await HiringPipelineState.findOne({ tenantId, employeeId: user._id }).lean();
        if (state?.candidateId) {
          candidate = await Candidate.findOne({ _id: state.candidateId, tenantId }).lean();
        } else if (user.email) {
          candidate = await Candidate.findOne({ tenantId, email: user.email }).lean();
        }
      }
    }
  }

  if (candidate && !user) {
    state = await HiringPipelineState.findOne({ tenantId, candidateId: candidate._id }).lean();
    if (state?.employeeId) {
      user = await User.findOne({ _id: state.employeeId, tenantId }).lean();
    } else if (candidate.email) {
      user = await User.findOne({ email: candidate.email, tenantId }).lean();
    }
  } else if (employeeId && !user) {
    user = await User.findOne({ _id: employeeId, tenantId }).lean();
    if (user && !candidate) {
      state = await HiringPipelineState.findOne({ tenantId, employeeId: user._id }).lean();
      if (state?.candidateId) {
        candidate = await Candidate.findOne({ _id: state.candidateId, tenantId }).lean();
      } else if (user.email) {
        candidate = await Candidate.findOne({ tenantId, email: user.email }).lean();
      }
    }
  }

  const idCardFilters: any[] = [];
  if (user?._id) idCardFilters.push({ employeeId: user._id });
  if (candidate?._id) idCardFilters.push({ candidateId: candidate._id });
  if (candidate?.employeeCode) idCardFilters.push({ employeeCode: candidate.employeeCode });
  if (candidate?.candidateCode) idCardFilters.push({ employeeCode: candidate.candidateCode });
  if (user?.employeeCode) idCardFilters.push({ employeeCode: user.employeeCode });

  const [idCard, joiningForm, emergencyDoc, joiningConfirmation, appointmentLetter, tenant] = await Promise.all([
    idCardFilters.length > 0 ? IDCard.findOne({ tenantId, $or: idCardFilters }).sort({ createdAt: -1 }).lean() : null,
    candidate ? JoiningForm.findOne({ tenantId, candidateId: candidate._id }).sort({ createdAt: -1 }).lean() : null,
    candidate ? EmergencyContact.findOne({ tenantId, candidateId: candidate._id }).sort({ createdAt: -1 }).lean() : null,
    candidate ? JoiningConfirmation.findOne({ tenantId, candidateId: candidate._id }).sort({ createdAt: -1 }).lean() : null,
    candidate ? AppointmentLetter.findOne({ tenantId, candidateId: candidate._id }).sort({ createdAt: -1 }).lean() : null,
    Tenant.findById(tenantId).lean()
  ]);

  let manpower: any = null;
  const manpowerRef = state?.steps?.find((s: any) => s.key === 'manpowerRequest')?.refId || (candidate as any)?.manpowerRequestId;
  if (manpowerRef) {
    manpower = await ManpowerRequest.findOne({ _id: manpowerRef, tenantId })
      .populate('reportingTo', 'firstName lastName email mobileNumber phone')
      .lean();
  }

  const rawFather = joiningForm?.personalDetails?.fatherMotherName ||
    emergencyDoc?.contacts?.find((c: any) => /father/i.test(c.relationship || ''))?.name ||
    (emergencyDoc?.primaryRelation && /father/i.test(emergencyDoc.primaryRelation) ? emergencyDoc.primaryName : '') ||
    (user as any)?.fatherName || '';

  const emergencyName = emergencyDoc?.primaryName ||
    joiningForm?.emergencyContact?.name ||
    joiningForm?.emergencyName ||
    user?.emergencyContactName ||
    rawFather || '';

  let emergencyNos = '';
  if (emergencyDoc?.primaryMobile) {
    emergencyNos = [emergencyDoc.primaryMobile, emergencyDoc.primaryAlternateNo].filter(Boolean).join(', ');
  } else if (joiningForm?.emergencyContact?.mobileNumber || joiningForm?.emergencyMobile) {
    emergencyNos = [
      joiningForm?.emergencyContact?.mobileNumber || joiningForm?.emergencyMobile,
      joiningForm?.emergencyContact?.alternateNumber || joiningForm?.emergencyAlternate
    ].filter(Boolean).join(', ');
  } else if (user?.emergencyContactNumber) {
    emergencyNos = user.emergencyContactNumber;
  }

  const rawHod = (manpower?.reportingTo ? `${(manpower.reportingTo as any).firstName || ''} ${(manpower.reportingTo as any).lastName || ''}`.trim() : '') ||
    joiningForm?.positionDetails?.reportingManager ||
    'Vinay Jayant';

  const rawHodContact = (manpower?.reportingTo as any)?.mobileNumber ||
    (manpower?.reportingTo as any)?.phone ||
    '9810247319';

  const rawHodEmail = (manpower?.reportingTo as any)?.email ||
    'vijay@designhouse.co.in';

  const code = idCard?.employeeCode ||
    user?.employeeCode ||
    candidate?.employeeCode ||
    candidate?.uniqueId ||
    candidate?.candidateCode ||
    '';

  const fullName = idCard?.employeeName ||
    (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '') ||
    joiningForm?.personalDetails?.fullName ||
    (candidate ? `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() : '');

  const designation = idCard?.designation ||
    (user as any)?.designation ||
    joiningForm?.positionDetails?.designation ||
    appointmentLetter?.position ||
    candidate?.jobRole ||
    '';

  const joiningDate = formatDateStr(
    joiningForm?.positionDetails?.joiningDate ||
    user?.dateOfJoining ||
    joiningConfirmation?.confirmedJoiningDate ||
    joiningConfirmation?.joiningDate ||
    appointmentLetter?.joiningDate ||
    idCard?.validFrom
  );

  const dob = formatDateStr(
    joiningForm?.personalDetails?.dob ||
    user?.dateOfBirth ||
    (candidate as any)?.applicationDetails?.dob
  );

  const bloodGroup = idCard?.bloodGroup ||
    joiningForm?.personalDetails?.bloodGroup ||
    emergencyDoc?.medicalInfo?.bloodGroup ||
    user?.bloodGroup ||
    '';

  const address = joiningForm?.contactDetails?.currentAddress ||
    joiningForm?.contactDetails?.permanentAddress ||
    emergencyDoc?.primaryAddress ||
    user?.currentAddress ||
    user?.permanentAddress ||
    '';

  const photo = idCard?.photoUrl ||
    candidate?.profileImageUrl ||
    joiningForm?.employeeImage ||
    user?.profilePictureUrl ||
    '';

  return {
    _id: idCard?._id || candidate?._id || user?._id,
    candidateId: candidate?._id,
    employeeId: user?._id || idCard?.employeeId,
    employeeName: fullName,
    employeeCode: code,
    uniqueId: code,
    designation,
    joiningDate,
    dob,
    bloodGroup,
    fatherName: rawFather,
    residenceAddress: address,
    emergencyContactName: emergencyName,
    emergencyContactNos: emergencyNos,
    hodName: rawHod,
    contactNo: rawHodContact,
    emailId: rawHodEmail,
    photo,
    cardType: idCard?.cardType || 'ID Card',
    status: idCard?.status || 'Pending',
    companyName: (tenant as any)?.name || 'Design House India Pvt. Ltd.',
    headOfficeAddress: (tenant as any)?.address || '12/51, Site II, Loni Road Industrial Area,\nMohan Nagar Ghaziabad-201007\nUttar Pradesh, Bharat'
  };
};

export const getIDCards = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const { employeeId, candidateId } = req.query;

    if (candidateId) {
      const enriched = await getEnrichedIdCardDetails(tenantId, String(candidateId), employeeId ? String(employeeId) : undefined);
      return res.status(200).json([enriched]);
    }

    const filter: any = { tenantId };
    if (employeeId) filter.employeeId = employeeId;

    const cards = await IDCard.find(filter)
      .populate('employeeId', 'firstName lastName email employeeCode')
      .populate('issuedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    if (cards.length === 0 && employeeId) {
      const enriched = await getEnrichedIdCardDetails(tenantId, undefined, String(employeeId));
      if (enriched && enriched.employeeName) {
        return res.status(200).json([enriched]);
      }
    }

    const sanitized = await Promise.all(cards.map(async (c: any) => {
      const doc = c.toObject ? c.toObject() : { ...c };
      const empCode = doc.employeeId?.employeeCode;
      if (empCode && (!doc.employeeCode || doc.employeeCode.startsWith('EMP-'))) {
        doc.employeeCode = empCode;
      }
      const enriched = await getEnrichedIdCardDetails(tenantId, undefined, doc.employeeId?._id || doc.employeeId);
      return {
        ...enriched,
        ...doc,
        employeeCode: doc.employeeCode || enriched.employeeCode,
        joiningDate: doc.joiningDate ? formatDateStr(doc.joiningDate) : enriched.joiningDate,
        dob: doc.dob ? formatDateStr(doc.dob) : enriched.dob,
        fatherName: doc.fatherName || enriched.fatherName,
        residenceAddress: doc.residenceAddress || enriched.residenceAddress,
        emergencyContactName: doc.emergencyContactName || enriched.emergencyContactName,
        emergencyContactNos: doc.emergencyContactNos || enriched.emergencyContactNos,
        hodName: doc.hodName || enriched.hodName,
        contactNo: doc.contactNo || enriched.contactNo,
        emailId: doc.emailId || enriched.emailId,
        photo: doc.photoUrl || enriched.photo,
      };
    }));
    res.status(200).json(sanitized);
  } catch (error: any) {
    console.error('Error fetching ID cards:', error);
    res.status(500).json({ message: 'Error fetching ID cards' });
  }
};

export const updateIDCard = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const existing = await IDCard.findOne({ _id: req.params.id, tenantId } as any);
    const canonicalCode = await resolveCanonicalCodeForEmployee(tenantId, existing?.employeeId, req.body.employeeCode);

    const card = await IDCard.findOneAndUpdate(
      { _id: req.params.id, tenantId } as any,
      { $set: { ...req.body, ...(canonicalCode ? { employeeCode: canonicalCode } : {}) } },
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

    const employeeId = (await resolveEmployeeId(tenantId, req.body.employeeId)) || req.body.employeeId;
    const checkedBy = req.body.checkedBy || req.user!._id;

    const qa = await ReleaseQA.create({ ...req.body, employeeId, tenantId, checkedBy });
    await advanceStepForEmployee(req, tenantId, String(employeeId), 'releaseQA', 'in_progress', (qa as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_RELEASE_QA', req, { qaId: (qa as any)._id });

    const populated = await ReleaseQA.findById(qa._id)
      .populate('checkedBy', 'firstName lastName email employeeCode')
      .populate('employeeId', 'firstName lastName email employeeCode');

    res.status(201).json(populated || qa);
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

    const qas = await ReleaseQA.find(filter)
      .populate('checkedBy', 'firstName lastName email employeeCode')
      .populate('employeeId', 'firstName lastName email employeeCode')
      .sort({ createdAt: -1 });
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
    )
      .populate('checkedBy', 'firstName lastName email employeeCode')
      .populate('employeeId', 'firstName lastName email employeeCode');
    if (!qa) return res.status(404).json({ message: 'Release QA not found' });
    
    const targetEmployeeId = String((qa.employeeId as any)?._id || qa.employeeId);
    // Auto-advance if Passed
    if (qa.qaStatus === 'Passed') {
      await advanceStepForEmployee(req, tenantId, targetEmployeeId, 'releaseQA', 'completed', qa._id as any);
    } else if (qa.qaStatus === 'Failed') {
      await advanceStepForEmployee(req, tenantId, targetEmployeeId, 'releaseQA', 'rejected', qa._id as any);
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

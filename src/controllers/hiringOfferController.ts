import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { CTCBreakup } from '../models/CTCBreakup';
import { LetterOfIntent } from '../models/LetterOfIntent';
import { OfferLetter } from '../models/OfferLetter';
import { NDADocument } from '../models/NDADocument';
import { AppointmentLetter } from '../models/AppointmentLetter';
import { Candidate } from '../models/Candidate';
import { AuditLog } from '../models/AuditLog';
import { savePdfToCloudinary } from '../utils/pdfGenerator';
import { generateCandidateHiringPdfBuffer } from '../utils/candidatePdfGenerator';
import { getCompanyDocumentBranding } from '../utils/companyDocumentBranding';
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

// Step 4: CTC Breakup
export const createCTCBreakup = async (req: AuthRequest, res: Response) => {
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
        const newCandidate = await Candidate.create({ tenantId, firstName, lastName, email, phone: '0000000000', jobRole: req.body.department || 'Candidate' });
        candidateId = newCandidate._id;
      }
    }

    const b = req.body.breakup || {};
    const annualCTC = parseFloat(String(req.body.annualCTC || '0').replace(/,/g, '')) || 0;
    const monthlyGross = annualCTC / 12;
    const pfDeduction = parseFloat(String(req.body.pfDeduction || '0').replace(/,/g, '')) || 0;
    const monthlyDeductions = pfDeduction;

    const ctcBreakup = await CTCBreakup.create({
      ...req.body,
      tenantId,
      candidateId,
      annualCTC,
      preparedBy: req.user!._id,
      monthlyGross,
      monthlyTakeHome: monthlyGross - monthlyDeductions,
      approvalStatus: 'Pending'
    });

    if (candidateId) {
      await advanceStep(req, tenantId, candidateId, 'ctcBreakup', 'completed', (ctcBreakup as any)._id);
    }
    await logAudit(tenantId, req.user!._id, 'CREATE_CTC_BREAKUP', req, { ctcBreakupId: (ctcBreakup as any)._id });
    res.status(201).json(ctcBreakup);
  } catch (error: any) {
    console.error('Error creating CTC breakup:', error);
    res.status(500).json({ message: 'Error creating CTC breakup' });
  }
};

export const getCTCBreakups = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;

    const breakups = await CTCBreakup.find(filter)
      .populate('candidateId', 'firstName lastName jobRole')
      .populate('preparedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();

    const mapped = breakups.map((b: any) => ({
      _id: b._id,
      candidateName: b.candidateId ? `${(b.candidateId as any).firstName} ${(b.candidateId as any).lastName}`.trim() : 'Unknown',
      department: (b.candidateId as any)?.jobRole || 'N/A',
      annualCTC: b.annualCTC?.toLocaleString() || '0',
      netTakeHome: b.monthlyTakeHome?.toLocaleString() || '0',
      status: b.approvalStatus || 'Pending',
      createdBy: b.preparedBy,
      updatedAt: b.updatedAt
    }));

    res.status(200).json({ data: mapped });
  } catch (error: any) {
    console.error('Error fetching CTC breakups:', error);
    res.status(500).json({ message: 'Error fetching CTC breakups' });
  }
};

// Step 5: Letter of Intent (LOI)
export const createLOI = async (req: AuthRequest, res: Response) => {
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
        const newCandidate = await Candidate.create({ tenantId, firstName, lastName, email, phone: '0000000000', jobRole: req.body.position || 'Candidate' });
        candidateId = newCandidate._id;
      }
    }

    const loi = await LetterOfIntent.create({
      ...req.body,
      tenantId,
      candidateId,
      designation: req.body.position,
      joiningDate: req.body.joiningDate,
      issuedBy: req.user!._id,
      status: 'Issued'
    });
    
    if (candidateId) {
      await advanceStep(req, tenantId, candidateId, 'loi', 'in_progress', (loi as any)._id);
    }
    await logAudit(tenantId, req.user!._id, 'CREATE_LOI', req, { loiId: (loi as any)._id });
    res.status(201).json(loi);
  } catch (error: any) {
    console.error('Error creating LOI:', error);
    res.status(500).json({ message: 'Error creating LOI' });
  }
};

export const getLOIs = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;

    const lois = await LetterOfIntent.find(filter)
      .populate('candidateId', 'firstName lastName')
      .populate('issuedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();
      
    const mapped = lois.map((l: any) => ({
      _id: l._id,
      candidateName: l.candidateId ? `${(l.candidateId as any).firstName} ${(l.candidateId as any).lastName}`.trim() : 'Unknown',
      department: 'N/A', // or from candidate if needed
      position: l.designation || 'N/A',
      joiningDate: l.joiningDate || null,
      status: l.status || 'Pending',
      createdBy: l.issuedBy,
      updatedAt: l.updatedAt
    }));

    res.status(200).json({ data: mapped });
  } catch (error: any) {
    console.error('Error fetching LOIs:', error);
    res.status(500).json({ message: 'Error fetching LOIs' });
  }
};

export const generateLOIPdf = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    const loi = await LetterOfIntent.findOne({ _id: id, tenantId } as any);
    if (!loi) return res.status(404).json({ message: 'LOI not found' });

    const candidate = await Candidate.findOne({ _id: loi.candidateId, tenantId } as any);
    const branding = await getCompanyDocumentBranding(tenantId);

    const buffer = await generateCandidateHiringPdfBuffer({
      ...branding,
      title: 'Letter of Intent',
      recipientName: candidate ? `${candidate.firstName} ${candidate.lastName}` : undefined,
      lines: [
        { label: 'Designation', value: loi.designation },
        { label: 'Proposed CTC', value: loi.proposedCTC ? String(loi.proposedCTC) : 'N/A' },
        { label: 'Joining Date', value: loi.joiningDate ? new Date(loi.joiningDate).toDateString() : 'TBD' },
        { label: 'Valid Until', value: loi.validUntil ? new Date(loi.validUntil).toDateString() : 'N/A' },
        { value: loi.letterContent || 'We are pleased to extend this Letter of Intent to you for the above position, subject to successful completion of pre-joining formalities.' }
      ],
      footerNote: branding.footerNote
    });

    const pdfUrl = await savePdfToCloudinary(buffer, `loi-${id}.pdf`);
    loi.pdfUrl = pdfUrl;
    loi.status = 'Sent';
    loi.sentDate = new Date();
    await loi.save();

    // Step 6 only needs Step 5 "sent/accepted" — sending it is enough to unlock the next step.
    await advanceStep(req, tenantId, String(loi.candidateId), 'loi', 'completed', loi._id as any);

    await logAudit(tenantId, req.user!._id, 'GENERATE_LOI_PDF', req, { loiId: id });
    res.status(200).json({ pdfUrl, loi });
  } catch (error: any) {
    console.error('Error generating LOI PDF:', error);
    res.status(500).json({ message: 'Error generating LOI PDF' });
  }
};

// Step 13: Offer Letter
export const createOfferLetter = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const offer = await OfferLetter.create({ ...req.body, tenantId, issuedBy: req.user!._id });
    await advanceStep(req, tenantId, req.body.candidateId, 'offerLetter', 'in_progress', (offer as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_OFFER_LETTER', req, { offerId: (offer as any)._id });
    res.status(201).json(offer);
  } catch (error: any) {
    console.error('Error creating offer letter:', error);
    res.status(500).json({ message: 'Error creating offer letter' });
  }
};

export const getOfferLetters = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;

    const offers = await OfferLetter.find(filter).sort({ createdAt: -1 });
    res.status(200).json(offers);
  } catch (error: any) {
    console.error('Error fetching offer letters:', error);
    res.status(500).json({ message: 'Error fetching offer letters' });
  }
};

export const generateOfferLetterPdf = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    const offer = await OfferLetter.findOne({ _id: id, tenantId } as any);
    if (!offer) return res.status(404).json({ message: 'Offer letter not found' });

    const candidate = await Candidate.findOne({ _id: offer.candidateId, tenantId } as any);
    const branding = await getCompanyDocumentBranding(tenantId);

    const buffer = await generateCandidateHiringPdfBuffer({
      ...branding,
      title: 'Offer Letter',
      recipientName: candidate ? `${candidate.firstName} ${candidate.lastName}` : undefined,
      lines: [
        { label: 'Designation', value: offer.designation },
        { label: 'Joining Date', value: offer.joiningDate ? new Date(offer.joiningDate).toDateString() : 'TBD' },
        { label: 'Offer Valid Until', value: offer.validUntil ? new Date(offer.validUntil).toDateString() : 'N/A' },
        { value: offer.offerContent || 'We are pleased to offer you the above position. Please review the terms and confirm your acceptance.' }
      ],
      footerNote: branding.footerNote
    });

    const pdfUrl = await savePdfToCloudinary(buffer, `offer-${id}.pdf`);
    offer.pdfUrl = pdfUrl;
    offer.status = 'Sent';
    offer.sentDate = new Date();
    await offer.save();

    await logAudit(tenantId, req.user!._id, 'GENERATE_OFFER_LETTER_PDF', req, { offerId: id });
    res.status(200).json({ pdfUrl, offer });
  } catch (error: any) {
    console.error('Error generating offer letter PDF:', error);
    res.status(500).json({ message: 'Error generating offer letter PDF' });
  }
};

export const respondToOfferLetter = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const { status } = req.body;

    const offer = await OfferLetter.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { status, respondedDate: new Date() },
      { returnDocument: 'after' }
    );
    if (!offer) return res.status(404).json({ message: 'Offer letter not found' });

    if (status === 'Accepted') {
      await advanceStep(req, tenantId, String(offer.candidateId), 'offerLetter', 'approved', offer._id as any);
    } else if (status === 'Declined') {
      await advanceStep(req, tenantId, String(offer.candidateId), 'offerLetter', 'rejected', offer._id as any);
    }

    await logAudit(tenantId, req.user!._id, 'RESPOND_OFFER_LETTER', req, { offerId: id, status });
    res.status(200).json(offer);
  } catch (error: any) {
    console.error('Error updating offer letter response:', error);
    res.status(500).json({ message: 'Error updating offer letter response' });
  }
};

// Step 14: NDA
export const createNDA = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const nda = await NDADocument.create({ ...req.body, tenantId, issuedBy: req.user!._id });
    await advanceStep(req, tenantId, req.body.candidateId, 'nda', 'in_progress', (nda as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_NDA', req, { ndaId: (nda as any)._id });
    res.status(201).json(nda);
  } catch (error: any) {
    console.error('Error creating NDA:', error);
    res.status(500).json({ message: 'Error creating NDA' });
  }
};

export const getNDAs = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;

    const ndas = await NDADocument.find(filter).sort({ createdAt: -1 });
    res.status(200).json(ndas);
  } catch (error: any) {
    console.error('Error fetching NDAs:', error);
    res.status(500).json({ message: 'Error fetching NDAs' });
  }
};

export const generateNDAPdf = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    const nda = await NDADocument.findOne({ _id: id, tenantId } as any);
    if (!nda) return res.status(404).json({ message: 'NDA not found' });

    const candidate = await Candidate.findOne({ _id: nda.candidateId, tenantId } as any);
    const branding = await getCompanyDocumentBranding(tenantId);

    const buffer = await generateCandidateHiringPdfBuffer({
      ...branding,
      title: 'Non-Disclosure Agreement',
      recipientName: candidate ? `${candidate.firstName} ${candidate.lastName}` : undefined,
      lines: [
        { value: nda.documentContent || 'This Non-Disclosure Agreement governs the confidential information shared during and after the course of employment.' }
      ],
      footerNote: branding.footerNote
    });

    const pdfUrl = await savePdfToCloudinary(buffer, `nda-${id}.pdf`);
    nda.pdfUrl = pdfUrl;
    await nda.save();

    await logAudit(tenantId, req.user!._id, 'GENERATE_NDA_PDF', req, { ndaId: id });
    res.status(200).json({ pdfUrl, nda });
  } catch (error: any) {
    console.error('Error generating NDA PDF:', error);
    res.status(500).json({ message: 'Error generating NDA PDF' });
  }
};

export const signNDA = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    const nda = await NDADocument.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { signedStatus: 'Signed', signedDate: new Date(), signatureIp: req.ip },
      { returnDocument: 'after' }
    );
    if (!nda) return res.status(404).json({ message: 'NDA not found' });

    await advanceStep(req, tenantId, String(nda.candidateId), 'nda', 'approved', nda._id as any);

    await logAudit(tenantId, req.user!._id, 'SIGN_NDA', req, { ndaId: id });
    res.status(200).json(nda);
  } catch (error: any) {
    console.error('Error signing NDA:', error);
    res.status(500).json({ message: 'Error signing NDA' });
  }
};

// Step 17: Appointment Letter
export const createAppointmentLetter = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const letter = await AppointmentLetter.create({ ...req.body, tenantId, issuedBy: req.user!._id });
    await advanceStep(req, tenantId, req.body.candidateId, 'appointmentLetter', 'in_progress', (letter as any)._id);
    await logAudit(tenantId, req.user!._id, 'CREATE_APPOINTMENT_LETTER', req, { letterId: (letter as any)._id });
    res.status(201).json(letter);
  } catch (error: any) {
    console.error('Error creating appointment letter:', error);
    res.status(500).json({ message: 'Error creating appointment letter' });
  }
};

export const getAppointmentLetters = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { candidateId } = req.query;
    const filter: any = { tenantId };
    if (candidateId) filter.candidateId = candidateId;

    const letters = await AppointmentLetter.find(filter).sort({ createdAt: -1 });
    res.status(200).json(letters);
  } catch (error: any) {
    console.error('Error fetching appointment letters:', error);
    res.status(500).json({ message: 'Error fetching appointment letters' });
  }
};

export const generateAppointmentLetterPdf = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    const letter = await AppointmentLetter.findOne({ _id: id, tenantId } as any);
    if (!letter) return res.status(404).json({ message: 'Appointment letter not found' });

    const candidate = await Candidate.findOne({ _id: letter.candidateId, tenantId } as any);
    const branding = await getCompanyDocumentBranding(tenantId);

    const buffer = await generateCandidateHiringPdfBuffer({
      ...branding,
      title: 'Appointment Letter',
      recipientName: candidate ? `${candidate.firstName} ${candidate.lastName}` : undefined,
      lines: [
        { label: 'Designation', value: letter.designation },
        { label: 'Department', value: letter.departmentName || '—' },
        { label: 'Reporting To', value: letter.reportingTo || '—' },
        { label: 'Work Location', value: letter.workLocation || '—' },
        { label: 'Joining Date', value: letter.joiningDate ? new Date(letter.joiningDate).toDateString() : 'TBD' },
        { label: 'Probation Period', value: `${letter.probationPeriodMonths || 6} months` },
        { label: 'Annual CTC', value: letter.ctc ? `₹${letter.ctc.toLocaleString('en-IN')} ${letter.ctcInWords ? `(${letter.ctcInWords})` : ''}` : '—' },
        { label: 'Payment Mode', value: letter.paymentMode || '—' },
        { label: 'Working Hours', value: letter.workingHours || '—' },
        { label: 'Working Days', value: letter.workingDays || '—' },
        { label: 'Weekly Off', value: letter.weeklyOff || '—' },
        { value: '\n' },
        { value: letter.letterContent || 'We are pleased to confirm your appointment to the above position on the terms and conditions set out herein.' },
        { value: '\n\nEmployee Acknowledgement\n\nI acknowledge that I have received, read and accepted the terms of this Appointment Letter.\n\nName: ________________________\n\nSignature: ________________________    Date: ________________________' },
      ],
      footerNote: branding.footerNote
    });

    const pdfUrl = await savePdfToCloudinary(buffer, `appointment-${id}.pdf`);
    letter.pdfUrl = pdfUrl;
    letter.status = 'Issued';
    letter.issuedDate = new Date();
    await letter.save();

    await advanceStep(req, tenantId, String(letter.candidateId), 'appointmentLetter', 'completed', letter._id as any);

    await logAudit(tenantId, req.user!._id, 'GENERATE_APPOINTMENT_LETTER_PDF', req, { letterId: id });
    res.status(200).json({ pdfUrl, letter });
  } catch (error: any) {
    console.error('Error generating appointment letter PDF:', error);
    res.status(500).json({ message: 'Error generating appointment letter PDF' });
  }
};

export const acknowledgeAppointmentLetter = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    const letter = await AppointmentLetter.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { status: 'Acknowledged', acknowledgedDate: new Date() },
      { returnDocument: 'after' }
    );
    if (!letter) return res.status(404).json({ message: 'Appointment letter not found' });

    await advanceStep(req, tenantId, String(letter.candidateId), 'appointmentLetter', 'approved', letter._id as any);

    await logAudit(tenantId, req.user!._id, 'ACKNOWLEDGE_APPOINTMENT_LETTER', req, { letterId: id });
    res.status(200).json(letter);
  } catch (error: any) {
    console.error('Error acknowledging appointment letter:', error);
    res.status(500).json({ message: 'Error acknowledging appointment letter' });
  }
};

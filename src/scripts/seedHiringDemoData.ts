/**
 * Seeds all 24 hiring-pipeline steps for a handful of existing candidates, so every
 * step's admin table (Bank & Payroll, Nomination, Offer Letter, etc.) has real rows
 * to show instead of being empty. Run with: npx ts-node src/scripts/seedHiringDemoData.ts
 *
 * The shared MongoDB Atlas cluster backing this app is at its free-tier 500-collection
 * cap (cluster-wide, across every database on it), so creating the first-ever document
 * in a model whose collection hasn't been created yet fails with Atlas error code 8000.
 * Each step below is isolated via runStep() so one such failure just skips that step's
 * own record (the pipeline status still advances, since HiringPipelineState/AuditLog
 * already exist) instead of aborting the whole seed.
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { Candidate } from '../models/Candidate';
import { User } from '../models/User';
import { Interview } from '../models/Interview';
import { InterviewEvaluation } from '../models/InterviewEvaluation';
import { SelectionApproval } from '../models/SelectionApproval';
import { CTCBreakup } from '../models/CTCBreakup';
import { LetterOfIntent } from '../models/LetterOfIntent';
import { JoiningConfirmation } from '../models/JoiningConfirmation';
import { DocumentChecklist } from '../models/DocumentChecklist';
import { BGVRequest } from '../models/BGVRequest';
import { JoiningForm } from '../models/JoiningForm';
import { Nomination } from '../models/Nomination';
import { BankPayrollInfo } from '../models/BankPayrollInfo';
import { EmergencyContact } from '../models/EmergencyContact';
import { OfferLetter } from '../models/OfferLetter';
import { NDADocument } from '../models/NDADocument';
import { PolicyAcceptance } from '../models/PolicyAcceptance';
import { ConductAcceptance } from '../models/ConductAcceptance';
import { AppointmentLetter } from '../models/AppointmentLetter';
import { AssetAccessForm } from '../models/AssetAccessForm';
import { EngagementConfirmation } from '../models/EngagementConfirmation';
import { InductionForm } from '../models/InductionForm';
import { TeamIntro } from '../models/TeamIntro';
import { ProbationReview } from '../models/ProbationReview';
import { HiringPerformanceEval } from '../models/HiringPerformanceEval';
import { IDCard } from '../models/IDCard';
import { ManpowerRequest } from '../models/ManpowerRequest';
import { advanceStep, advanceStepForEmployee, linkEmployeeId } from '../utils/hiringPipelineHelpers';
import bcrypt from 'bcrypt';

const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

const fakeReq = (actor: any): AuthRequest =>
  ({ user: actor, ip: '127.0.0.1', headers: { 'user-agent': 'seed-script' } } as unknown as AuthRequest);

const isCollectionLimitError = (err: any) =>
  err?.code === 8000 || /cannot create a new collection/i.test(err?.errmsg || err?.message || '');

async function runStep(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  [ok]   ${label}`);
  } catch (err: any) {
    if (isCollectionLimitError(err)) {
      console.warn(`  [skip] ${label} -- Atlas cluster at its collection cap, no new collection created`);
    } else {
      console.error(`  [fail] ${label}:`, err.message);
    }
  }
}

async function seedCandidate(candidate: any, actor: any, employee: any) {
  const tenantId = String(candidate.tenantId);
  const candidateId = String(candidate._id);
  const employeeId = String(employee._id);
  const req = fakeReq(actor);
  const label = `${candidate.firstName} ${candidate.lastName} (${candidateId})`;
  console.log(`\n--- Seeding ${label} ---`);

  let ctcId: any;

  await runStep('Step 1 - Approved Manpower Request', async () => {
    const manpower = await ManpowerRequest.create({
      tenantId, jobTitle: candidate.jobRole, designation: candidate.jobRole,
      numberOfPositions: 1, employmentType: 'Full-time', reasonForHiring: 'New Position',
      workLocation: 'Head Office', status: 'Approved', requestedBy: actor._id, approvedBy: actor._id,
      requestDate: days(-14), requiredJoiningDate: days(21), budgetCTC: 1200000,
    });
    await advanceStep(req, tenantId, candidateId, 'manpowerRequest', 'approved', manpower._id as any);
  });

  await runStep('Step 0/2 - Interview + Evaluation', async () => {
    const interview = await Interview.create({
      tenantId, candidateId, interviewerId: actor._id, roundType: 'Technical',
      scheduledDate: days(-7), status: 'Completed', rating: 4, feedback: 'Strong technical round.', mode: 'Video',
    });
    await advanceStep(req, tenantId, candidateId, 'interview', 'completed', interview._id as any);

    const evaluation = await InterviewEvaluation.create({
      tenantId, candidateId, interviewerId: actor._id, roundType: 'Technical',
      evaluationCriteria: [{ criterion: 'Technical Skills', score: 4 }, { criterion: 'Communication', score: 4 }],
      overallScore: 4, recommendation: 'Recommend', strengths: 'Solid fundamentals.', comments: 'Seed data.',
    });
    await advanceStep(req, tenantId, candidateId, 'interviewEvaluation', 'completed', evaluation._id as any);
  });

  await runStep('Step 3 - Selection Approval', async () => {
    const approval = await SelectionApproval.create({
      tenantId, candidateId, jobRole: candidate.jobRole, proposedCTC: 1200000,
      approvalChain: [{ approverId: actor._id, role: 'HR', status: 'Approved', actionDate: days(-6) }],
      finalStatus: 'Approved', approvedBy: actor._id, approvalDate: days(-6),
    });
    await advanceStep(req, tenantId, candidateId, 'selectionApproval', 'completed', approval._id as any);
    await advanceStep(req, tenantId, candidateId, 'selectionApproval', 'approved', approval._id as any);
  });

  await runStep('Step 4 - CTC Breakup', async () => {
    const ctc = await CTCBreakup.create({
      tenantId, candidateId, annualCTC: 1200000, currency: 'INR',
      breakup: { basic: 600000, hra: 240000, conveyance: 24000, medicalAllowance: 15000, specialAllowance: 200000, pfEmployer: 72000, pfEmployee: 72000, gratuity: 28846, bonus: 0, otherAllowances: 21154 },
      monthlyGross: 100000, monthlyTakeHome: 94000, preparedBy: actor._id, status: 'Finalized',
    });
    ctcId = ctc._id;
    await advanceStep(req, tenantId, candidateId, 'ctcBreakup', 'completed', ctc._id as any);
  });

  await runStep('Step 5 - Letter of Intent', async () => {
    const loi = await LetterOfIntent.create({
      tenantId, candidateId, designation: candidate.jobRole, proposedCTC: 1200000, joiningDate: days(21),
      validUntil: days(14), letterContent: 'We are pleased to extend this Letter of Intent.', issuedBy: actor._id,
      status: 'Accepted', sentDate: days(-5), respondedDate: days(-4),
    });
    await advanceStep(req, tenantId, candidateId, 'loi', 'in_progress', loi._id as any);
    await advanceStep(req, tenantId, candidateId, 'loi', 'completed', loi._id as any);
  });

  await runStep('Step 6 - Joining Confirmation', async () => {
    const joiningConfirmation = await JoiningConfirmation.create({
      tenantId, candidateId, confirmedJoiningDate: days(21), reportingTime: '09:30 AM', reportingLocation: 'Head Office',
      emailSentTo: candidate.email, emailSentAt: days(-4), status: 'Confirmed', confirmedByCandidate: true, sentBy: actor._id,
    });
    await advanceStep(req, tenantId, candidateId, 'joiningConfirmation', 'in_progress', joiningConfirmation._id as any);
    await advanceStep(req, tenantId, candidateId, 'joiningConfirmation', 'completed', joiningConfirmation._id as any);
  });

  await runStep('Step 7 - Document Checklist', async () => {
    const checklist = await DocumentChecklist.create({
      tenantId, candidateId,
      items: [
        { documentName: 'Aadhaar Card', status: 'Verified', verifiedBy: actor._id, verifiedAt: days(-3) },
        { documentName: 'PAN Card', status: 'Verified', verifiedBy: actor._id, verifiedAt: days(-3) },
        { documentName: 'Educational Certificates', status: 'Verified', verifiedBy: actor._id, verifiedAt: days(-3) },
      ],
      overallStatus: 'Verified',
    });
    await advanceStep(req, tenantId, candidateId, 'documentChecklist', 'in_progress', checklist._id as any);
    await advanceStep(req, tenantId, candidateId, 'documentChecklist', 'completed', checklist._id as any);
  });

  await runStep('Step 8 - BGV Request', async () => {
    const bgv = await BGVRequest.create({
      tenantId, candidateId, vendor: 'SeedCheck Verifications', requestedBy: actor._id, requestDate: days(-10),
      checksRequested: ['Address Verification', 'Employment Verification', 'Education Verification'],
      status: 'Completed', overallResult: 'Clear', completedDate: days(-3),
    });
    await advanceStep(req, tenantId, candidateId, 'bgvRequest', 'in_progress', bgv._id as any);
    await advanceStep(req, tenantId, candidateId, 'bgvRequest', 'completed', bgv._id as any);
  });

  await runStep('Step 9 - Joining Form', async () => {
    const joiningForm = await JoiningForm.create({
      tenantId, candidateId, employeeId: employee._id,
      personalDetails: { fullName: `${candidate.firstName} ${candidate.lastName}`, gender: 'Other', maritalStatus: 'Single', nationality: 'Indian' },
      contactDetails: { mobileNumber: candidate.phone, personalEmail: candidate.email, currentAddress: 'Seed Address, City', permanentAddress: 'Seed Address, City' },
      positionDetails: { designation: candidate.jobRole, department: 'Engineering', joiningDate: days(21), workLocation: 'Head Office', employeeCategory: 'Permanent' },
      identificationDetails: { panNumber: 'ABCDE1234F', aadhaarNumber: '123456789012' },
      approvalStatus: 'Verified', status: 'Verified',
      declaration: { hrVerifiedBy: `${actor.firstName} ${actor.lastName}`, hrDate: days(-2) },
    });
    await advanceStep(req, tenantId, candidateId, 'joiningForm', 'completed', joiningForm._id as any);
    await advanceStep(req, tenantId, candidateId, 'joiningForm', 'approved', joiningForm._id as any);
  });

  // Links employeeId onto the pipeline for steps 22-24 -- only touches HiringPipelineState,
  // which already exists, so this always succeeds regardless of the cap above.
  await runStep('Link employeeId onto pipeline', async () => {
    await linkEmployeeId(tenantId, candidateId, employeeId);
  });

  await runStep('Step 10 - Nomination', async () => {
    const nomination = await Nomination.create({
      tenantId, candidateId, employeeId: employee._id, nominationType: 'PF',
      nominees: [{ name: 'Family Member', relationship: 'Spouse', sharePercentage: 100, isMinor: false }],
      declarationDate: days(-2), witnessName: `${actor.firstName} ${actor.lastName}`,
      hrVerifiedBy: `${actor.firstName} ${actor.lastName}`, hrVerifiedDate: days(-2), status: 'Verified',
    });
    await advanceStep(req, tenantId, candidateId, 'nomination', 'completed', nomination._id as any);
    await advanceStep(req, tenantId, candidateId, 'nomination', 'approved', nomination._id as any);
  });

  await runStep('Step 11 - Bank & Payroll Info', async () => {
    const bankPayroll = await BankPayrollInfo.create({
      tenantId, candidateId, employeeId: employee._id, bankName: 'State Bank of India', accountHolderName: `${candidate.firstName} ${candidate.lastName}`,
      accountNumber: '123456789012', ifscCode: 'SBIN0001234', branchName: 'Main Branch', accountType: 'Savings',
      panNumber: 'ABCDE1234F', aadhaarNumber: '123456789012', employeeDeclaration: true, declarationDate: days(-2),
      hrVerifiedBy: `${actor.firstName} ${actor.lastName}`, hrVerifiedDate: days(-2), status: 'Verified',
    });
    await advanceStep(req, tenantId, candidateId, 'bankPayrollInfo', 'completed', bankPayroll._id as any);
    await advanceStep(req, tenantId, candidateId, 'bankPayrollInfo', 'approved', bankPayroll._id as any);
  });

  await runStep('Step 12 - Emergency Contact', async () => {
    const emergencyContact = await EmergencyContact.create({
      tenantId, candidateId, employeeId: employee._id,
      contacts: [{ isPrimary: true, name: 'Family Contact', relationship: 'Parent', phone: '9999999999' }],
      medicalInfo: { bloodGroup: 'O+' },
      hrVerifiedBy: `${actor.firstName} ${actor.lastName}`, hrVerifiedDate: days(-2), status: 'Verified',
    });
    await advanceStep(req, tenantId, candidateId, 'emergencyContact', 'completed', emergencyContact._id as any);
    await advanceStep(req, tenantId, candidateId, 'emergencyContact', 'approved', emergencyContact._id as any);
  });

  await runStep('Step 13 - Offer Letter', async () => {
    const offerLetter = await OfferLetter.create({
      tenantId, candidateId, ctcBreakupId: ctcId, designation: candidate.jobRole, joiningDate: days(21), validUntil: days(10),
      offerContent: 'We are pleased to offer you the above position.', issuedBy: actor._id, status: 'Accepted',
      sentDate: days(-9), respondedDate: days(-8),
    });
    await advanceStep(req, tenantId, candidateId, 'offerLetter', 'in_progress', offerLetter._id as any);
    await advanceStep(req, tenantId, candidateId, 'offerLetter', 'approved', offerLetter._id as any);
  });

  await runStep('Step 14 - NDA', async () => {
    const nda = await NDADocument.create({
      tenantId, candidateId, employeeId: employee._id,
      documentContent: 'This Non-Disclosure Agreement governs confidential information shared during employment.',
      issuedBy: actor._id, signedStatus: 'Signed', signedDate: days(-3), signatureIp: '127.0.0.1',
    });
    await advanceStep(req, tenantId, candidateId, 'nda', 'in_progress', nda._id as any);
    await advanceStep(req, tenantId, candidateId, 'nda', 'approved', nda._id as any);
  });

  await runStep('Step 15 - IT Policy Acceptance', async () => {
    const itPolicy = await PolicyAcceptance.create({
      tenantId, candidateId, employeeId: employee._id, policyTitle: 'IT Usage Policy', policyVersion: 'v1',
      signerName: `${candidate.firstName} ${candidate.lastName}`, hasRead: true, understands: true, agreesToComply: true,
      status: 'Accepted', acceptedAt: days(-3), ipAddress: '127.0.0.1',
    });
    await advanceStep(req, tenantId, candidateId, 'itPolicyAcceptance', 'approved', itPolicy._id as any);
  });

  await runStep('Step 16 - Code of Conduct Acceptance', async () => {
    const conduct = await ConductAcceptance.create({
      tenantId, candidateId, employeeId: employee._id, conductTitle: 'Code of Conduct', version: 'v1',
      signerName: `${candidate.firstName} ${candidate.lastName}`, hasRead: true, understands: true, agreesToComply: true,
      understandsConsequences: true, agreesToAbide: true, status: 'Accepted', acceptedAt: days(-3), ipAddress: '127.0.0.1',
    });
    await advanceStep(req, tenantId, candidateId, 'conductAcceptance', 'approved', conduct._id as any);
  });

  await runStep('Step 17 - Appointment Letter', async () => {
    const appointmentLetter = await AppointmentLetter.create({
      tenantId, candidateId, employeeId: employee._id, designation: candidate.jobRole, departmentName: 'Engineering',
      reportingTo: `${actor.firstName} ${actor.lastName}`, workLocation: 'Head Office', joiningDate: days(21),
      probationPeriodMonths: 6, ctc: 1200000, ctcInWords: 'Twelve Lakhs', paymentMode: 'Bank Transfer',
      workingHours: '9:30 AM - 6:30 PM', workingDays: 'Monday-Friday', weeklyOff: 'Saturday, Sunday',
      letterContent: 'We are pleased to confirm your appointment to the above position.',
      acknowledgedByName: `${candidate.firstName} ${candidate.lastName}`, status: 'Acknowledged',
      issuedDate: days(-2), acknowledgedDate: days(-1), issuedBy: actor._id,
    });
    await advanceStep(req, tenantId, candidateId, 'appointmentLetter', 'in_progress', appointmentLetter._id as any);
    await advanceStep(req, tenantId, candidateId, 'appointmentLetter', 'completed', appointmentLetter._id as any);
    await advanceStep(req, tenantId, candidateId, 'appointmentLetter', 'approved', appointmentLetter._id as any);
  });

  await runStep('Step 18 - Asset / Access Form', async () => {
    const assetAccess = await AssetAccessForm.create({
      tenantId, candidateId, employeeId: employee._id,
      assetsIssued: [{ assetType: 'Laptop', assetTag: 'LT-001', issuedDate: days(-1), condition: 'New' }],
      accessGranted: [{ systemName: 'Email', accessLevel: 'Standard', grantedDate: days(-1) }],
      stationeryIssued: [{ item: 'Notebook & Pen', quantity: 1 }],
      issuedBy: actor._id, status: 'Issued',
    });
    await advanceStep(req, tenantId, candidateId, 'assetAccessForm', 'completed', assetAccess._id as any);
  });

  await runStep('Step 19 - Engagement Confirmation', async () => {
    const engagement = await EngagementConfirmation.create({
      tenantId, candidateId, employeeId: employee._id, engagementType: 'Full-time', confirmedDate: days(-1), sentBy: actor._id, status: 'Confirmed',
    });
    await advanceStep(req, tenantId, candidateId, 'engagementConfirmation', 'completed', engagement._id as any);
  });

  await runStep('Step 20 - Induction', async () => {
    const induction = await InductionForm.create({
      tenantId, candidateId, employeeId: employee._id, inductionDate: days(-1),
      modules: [
        { moduleName: 'Company Policies', conductedBy: actor._id, completed: true, completedDate: days(-1) },
        { moduleName: 'Product Training', conductedBy: actor._id, completed: true, completedDate: days(-1) },
      ],
      overallStatus: 'Completed', feedback: 'Inducted successfully.',
    });
    await advanceStep(req, tenantId, candidateId, 'induction', 'in_progress', induction._id as any);
    await advanceStep(req, tenantId, candidateId, 'induction', 'completed', induction._id as any);
  });

  await runStep('Step 21 - Team Intro', async () => {
    const teamIntro = await TeamIntro.create({
      tenantId, candidateId, employeeId: employee._id,
      teamMembers: [{ userId: actor._id, name: `${actor.firstName} ${actor.lastName}`, designation: 'Manager' }],
      introductionNote: 'Welcome to the team!', sentBy: actor._id, sentDate: days(0),
    });
    await advanceStep(req, tenantId, candidateId, 'teamIntro', 'completed', teamIntro._id as any);
  });

  // Steps 22-24 are keyed by employeeId, not candidateId.
  await runStep('Step 22 - Probation Review', async () => {
    const probationReview = await ProbationReview.create({
      tenantId, employeeId, reviewPeriodStart: days(21), reviewPeriodEnd: days(21 + 90), reviewerId: actor._id,
      ratings: [{ parameter: 'Work Quality', score: 4 }, { parameter: 'Punctuality', score: 5 }],
      overallRating: 4.5, decision: 'Confirmed', reviewDate: days(21 + 90),
    });
    await advanceStepForEmployee(req, tenantId, employeeId, 'probationReview', 'in_progress', probationReview._id as any);
    await advanceStepForEmployee(req, tenantId, employeeId, 'probationReview', 'completed', probationReview._id as any);
  });

  await runStep('Step 23 - Performance Eval', async () => {
    const performanceEval = await HiringPerformanceEval.create({
      tenantId, employeeId, evaluationPeriod: 'Q1', evaluatorId: actor._id,
      kpis: [{ metric: 'Productivity', target: '90%', achieved: '95%', score: 5 }],
      overallScore: 5, strengths: 'Consistently exceeds expectations.', recommendation: 'Confirm', reviewDate: days(21 + 90),
    });
    await advanceStepForEmployee(req, tenantId, employeeId, 'performanceEval', 'completed', performanceEval._id as any);
  });

  await runStep('Step 24 - ID Card', async () => {
    const idCard = await IDCard.create({
      tenantId, employeeId, cardType: 'ID Card', employeeCode: `EMP-${employeeId.slice(-5).toUpperCase()}`,
      designation: candidate.jobRole, bloodGroup: 'O+', validFrom: days(21), validTo: days(21 + 365),
      status: 'Issued', issuedDate: days(22), issuedBy: actor._id,
    });
    await advanceStepForEmployee(req, tenantId, employeeId, 'idCard', 'in_progress', idCard._id as any);
    await advanceStepForEmployee(req, tenantId, employeeId, 'idCard', 'completed', idCard._id as any);
    await advanceStepForEmployee(req, tenantId, employeeId, 'idCard', 'approved', idCard._id as any);
  });

  console.log(`Finished ${label} -> employeeId ${employeeId}`);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(uri);

  const candidates = (await Candidate.find({}).setOptions({ bypassTenantIsolation: true }).sort({ createdAt: 1 }))
    .filter((c) => !!c.tenantId)
    .slice(0, 1);
  if (!candidates.length) throw new Error('No candidates with a valid tenantId found to seed');

  const usersByTenant = new Map<string, any[]>();
  for (const candidate of candidates) {
    const tenantId = String(candidate.tenantId);
    if (!usersByTenant.has(tenantId)) {
      const users = await User.find({ tenantId } as any).setOptions({ bypassTenantIsolation: true });
      usersByTenant.set(tenantId, users);
    }
  }

  for (const candidate of candidates) {
    const tenantId = String(candidate.tenantId);
    const users = usersByTenant.get(tenantId) || [];
    if (!users.length) {
      console.warn(`Skipping ${candidate.firstName} ${candidate.lastName}: no users in tenant ${tenantId}`);
      continue;
    }
    const actor = users[0];
    let employee = await User.findOne({ tenantId, email: candidate.email } as any);
    if (!employee) {
      employee = await User.create({
        tenantId,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        passwordHash: await bcrypt.hash('SeedHiring@123', 10),
        profilePictureUrl: candidate.profileImageUrl,
        mobileNumber: candidate.phone,
        employeeCode: `SEED-${String(candidate._id).slice(-6).toUpperCase()}`,
        employmentStatus: 'active',
        isActive: true,
        createdBy: actor._id,
      } as any);
      console.log(`Created seeded employee ${employee._id} for ${candidate.email}`);
    }
    await seedCandidate(candidate, actor, employee);
  }

  console.log('\nAll done.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

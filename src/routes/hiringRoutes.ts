import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import { requireStepUnlocked } from '../middleware/hiringGate';
import {
  createCandidate,
  getCandidates,
  getCandidateById,
  getCandidatePipelineState,
  updateCandidateStatus,
  scheduleInterview,
  getAllInterviews,
  getInterviewsForCandidate,
  submitInterviewFeedback
} from '../controllers/hiringController';
import {
  createManpowerRequest,
  getManpowerRequests,
  updateManpowerRequest,
  updateManpowerRequestStatus,
  createInterviewEvaluation,
  getInterviewEvaluations,
  createSelectionApproval,
  getSelectionApprovals,
  updateSelectionApprovalDecision
} from '../controllers/hiringRequisitionController';
import {
  createCTCBreakup,
  getCTCBreakups,
  createLOI,
  getLOIs,
  generateLOIPdf,
  createOfferLetter,
  getOfferLetters,
  generateOfferLetterPdf,
  respondToOfferLetter,
  createNDA,
  getNDAs,
  generateNDAPdf,
  signNDA,
  createAppointmentLetter,
  getAppointmentLetters,
  generateAppointmentLetterPdf,
  acknowledgeAppointmentLetter
} from '../controllers/hiringOfferController';
import {
  createJoiningConfirmation,
  getJoiningConfirmations,
  confirmJoiningByCandidate,
  createDocumentChecklist,
  getDocumentChecklists,
  updateDocumentChecklistItem,
  createBGVRequest,
  getBGVRequests,
  updateBGVReport
} from '../controllers/hiringPreJoiningController';
import {
  createJoiningForm,
  getJoiningForms,
  createNomination,
  getNominations,
  createBankPayrollInfo,
  getBankPayrollInfos,
  createEmergencyContact,
  getEmergencyContacts,
  createPolicyAcceptance,
  getPolicyAcceptances,
  createConductAcceptance,
  getConductAcceptances,
  createAssetAccessForm,
  getAssetAccessForms,
  createEngagementConfirmation,
  getEngagementConfirmations,
  createInductionForm,
  getInductionForms,
  updateInductionModule,
  createTeamIntro,
  getTeamIntros
} from '../controllers/hiringOnboardingController';
import {
  createProbationReview,
  getProbationReviews,
  updateProbationDecision,
  createHiringPerformanceEval,
  getHiringPerformanceEvals,
  createIDCard,
  getIDCards,
  generateIDCardPdf,
  markIDCardIssued
} from '../controllers/hiringPostJoiningController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

// ATS Candidate Pipeline
router.post('/candidates', checkPermission('ORG_WRITE'), createCandidate);
router.get('/candidates', checkPermission('ORG_READ'), getCandidates);
router.get('/candidates/:candidateId/pipeline', checkPermission('ORG_READ'), getCandidatePipelineState);
router.get('/candidates/:id', checkPermission('ORG_READ'), getCandidateById);
router.put('/candidates/:id/status', checkPermission('ORG_WRITE'), updateCandidateStatus);

// Interviews
router.post('/interviews', checkPermission('ATS_WRITE'), scheduleInterview);
router.get('/interviews', checkPermission('ATS_READ'), getAllInterviews);
router.get('/interviews/:candidateId', checkPermission('ATS_READ'), getInterviewsForCandidate);
router.put('/interviews/:id/feedback', checkPermission('ATS_WRITE'), submitInterviewFeedback);

// Manpower Requests
router.post('/manpower-request', checkPermission('ORG_WRITE'), createManpowerRequest);
router.get('/manpower-request', checkPermission('ORG_READ'), getManpowerRequests);
router.put('/manpower-request/:id', checkPermission('ORG_WRITE'), updateManpowerRequest);
router.put('/manpower-request/:id/status', checkPermission('ORG_WRITE'), updateManpowerRequestStatus);

// Step 2: Interview Evaluation Sheet
router.post('/evaluation', checkPermission('ORG_WRITE'), requireStepUnlocked('interviewEvaluation'), createInterviewEvaluation);
router.get('/evaluation', checkPermission('ORG_READ'), getInterviewEvaluations);

// Step 3: Selection Approval Note
router.post('/selection-approval', checkPermission('ORG_WRITE'), requireStepUnlocked('selectionApproval'), createSelectionApproval);
router.get('/selection-approval', checkPermission('ORG_READ'), getSelectionApprovals);
router.put('/selection-approval/:id/decision', checkPermission('ORG_WRITE'), updateSelectionApprovalDecision);

// Step 4: CTC Breakup
router.post('/ctc-breakup', checkPermission('ORG_WRITE'), requireStepUnlocked('ctcBreakup'), createCTCBreakup);
router.get('/ctc-breakup', checkPermission('ORG_READ'), getCTCBreakups);

// Step 5: Letter of Intent (LOI)
router.post('/loi', checkPermission('ORG_WRITE'), requireStepUnlocked('loi'), createLOI);
router.get('/loi', checkPermission('ORG_READ'), getLOIs);
router.post('/loi/:id/generate-pdf', checkPermission('ORG_WRITE'), generateLOIPdf);

// Step 6: Joining Confirmation Mail
router.post('/joining-confirmation', checkPermission('ORG_WRITE'), requireStepUnlocked('joiningConfirmation'), createJoiningConfirmation);
router.get('/joining-confirmation', checkPermission('ORG_READ'), getJoiningConfirmations);
router.put('/joining-confirmation/:id/confirm', checkPermission('ORG_WRITE'), confirmJoiningByCandidate);

// Step 7: Document Checklist
router.post('/doc-checklist', checkPermission('ORG_WRITE'), requireStepUnlocked('documentChecklist'), createDocumentChecklist);
router.get('/doc-checklist', checkPermission('ORG_READ'), getDocumentChecklists);
router.put('/doc-checklist/:id/items/:itemIndex', checkPermission('ORG_WRITE'), updateDocumentChecklistItem);

// Step 8: BGV Request Form & BGV Report
router.post('/bgv', checkPermission('ORG_WRITE'), requireStepUnlocked('bgvRequest'), createBGVRequest);
router.get('/bgv', checkPermission('ORG_READ'), getBGVRequests);
router.put('/bgv/:id/report', checkPermission('ORG_WRITE'), updateBGVReport);

// Step 9: Employee Joining Form
router.post('/joining-form', checkPermission('ORG_WRITE'), requireStepUnlocked('joiningForm'), createJoiningForm);
router.get('/joining-form', checkPermission('ORG_READ'), getJoiningForms);

// Step 10: Nomination Form
router.post('/nomination', checkPermission('ORG_WRITE'), requireStepUnlocked('nomination'), createNomination);
router.get('/nomination', checkPermission('ORG_READ'), getNominations);

// Step 11: Bank & Payroll Information Form
router.post('/bank-payroll', checkPermission('ORG_WRITE'), requireStepUnlocked('bankPayrollInfo'), createBankPayrollInfo);
router.get('/bank-payroll', checkPermission('ORG_READ'), getBankPayrollInfos);

// Step 12: Emergency Contact Details Form
router.post('/emergency-contact', checkPermission('ORG_WRITE'), requireStepUnlocked('emergencyContact'), createEmergencyContact);
router.get('/emergency-contact', checkPermission('ORG_READ'), getEmergencyContacts);

// Step 13: Offer Letter
router.post('/offer-letter', checkPermission('ORG_WRITE'), requireStepUnlocked('offerLetter'), createOfferLetter);
router.get('/offer-letter', checkPermission('ORG_READ'), getOfferLetters);
router.post('/offer-letter/:id/generate-pdf', checkPermission('ORG_WRITE'), generateOfferLetterPdf);
router.put('/offer-letter/:id/respond', checkPermission('ORG_WRITE'), respondToOfferLetter);

// Step 14: NDA
router.post('/nda', checkPermission('ORG_WRITE'), requireStepUnlocked('nda'), createNDA);
router.get('/nda', checkPermission('ORG_READ'), getNDAs);
router.post('/nda/:id/generate-pdf', checkPermission('ORG_WRITE'), generateNDAPdf);
router.put('/nda/:id/sign', checkPermission('ORG_WRITE'), signNDA);

// Step 15: IT Policy & IT Acceptance Form
router.post('/it-policy-accept', checkPermission('ORG_WRITE'), requireStepUnlocked('itPolicyAcceptance'), createPolicyAcceptance);
router.get('/it-policy-accept', checkPermission('ORG_READ'), getPolicyAcceptances);

// Step 16: Code of Conduct Acceptance
router.post('/code-of-conduct-accept', checkPermission('ORG_WRITE'), requireStepUnlocked('conductAcceptance'), createConductAcceptance);
router.get('/code-of-conduct-accept', checkPermission('ORG_READ'), getConductAcceptances);

// Step 17: Appointment Letter
router.post('/appointment-letter', checkPermission('ORG_WRITE'), requireStepUnlocked('appointmentLetter'), createAppointmentLetter);
router.get('/appointment-letter', checkPermission('ORG_READ'), getAppointmentLetters);
router.post('/appointment-letter/:id/generate-pdf', checkPermission('ORG_WRITE'), generateAppointmentLetterPdf);
router.put('/appointment-letter/:id/acknowledge', checkPermission('ORG_WRITE'), acknowledgeAppointmentLetter);

// Step 18: IT Assets / IT Access / Stationery Form
router.post('/asset-access', checkPermission('ORG_WRITE'), requireStepUnlocked('assetAccessForm'), createAssetAccessForm);
router.get('/asset-access', checkPermission('ORG_READ'), getAssetAccessForms);

// Step 19: Engagement Confirmation Form
router.post('/engagement-confirm', checkPermission('ORG_WRITE'), requireStepUnlocked('engagementConfirmation'), createEngagementConfirmation);
router.get('/engagement-confirm', checkPermission('ORG_READ'), getEngagementConfirmations);

// Step 20: Induction Form
router.post('/induction', checkPermission('ORG_WRITE'), requireStepUnlocked('induction'), createInductionForm);
router.get('/induction', checkPermission('ORG_READ'), getInductionForms);
router.put('/induction/:id/modules/:moduleIndex/complete', checkPermission('ORG_WRITE'), updateInductionModule);

// Step 21: Team Introduction Note
router.post('/team-intro', checkPermission('ORG_WRITE'), requireStepUnlocked('teamIntro'), createTeamIntro);
router.get('/team-intro', checkPermission('ORG_READ'), getTeamIntros);

// Step 22: Probation Review Form
router.post('/probation-review', checkPermission('ORG_WRITE'), requireStepUnlocked('probationReview', { candidateField: 'employeeId' }), createProbationReview);
router.get('/probation-review', checkPermission('ORG_READ'), getProbationReviews);
router.put('/probation-review/:id/decision', checkPermission('ORG_WRITE'), updateProbationDecision);

// Step 23: Employee Performance Evaluation Sheet
router.post('/perf-eval', checkPermission('ORG_WRITE'), requireStepUnlocked('performanceEval', { candidateField: 'employeeId' }), createHiringPerformanceEval);
router.get('/perf-eval', checkPermission('ORG_READ'), getHiringPerformanceEvals);

// Step 24: Visiting Card / ID Card
router.post('/id-card', checkPermission('ORG_WRITE'), requireStepUnlocked('idCard', { candidateField: 'employeeId' }), createIDCard);
router.get('/id-card', checkPermission('ORG_READ'), getIDCards);
router.post('/id-card/:id/generate-pdf', checkPermission('ORG_WRITE'), generateIDCardPdf);
router.put('/id-card/:id/issue', checkPermission('ORG_WRITE'), markIDCardIssued);

export default router;

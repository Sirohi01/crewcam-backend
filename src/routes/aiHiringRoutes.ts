import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import { requireFeature } from '../middleware/featureGate';
import { requireAiCredits } from '../middleware/aiCreditGate';
import { aiScreeningLimiter, aiGenerationLimiter } from '../middleware/rateLimiter';
import { triggerResumeScreening, getResumeScreenings, getResumeScreeningQueue } from '../controllers/aiHiringController';
import { triggerGenerateJd, triggerGenerateKra, triggerGenerateInterviewQuestions } from '../controllers/aiManpowerController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);
router.post(
  '/hiring/resume-screen/:candidateId',
  requireFeature('ai-hiring'),
  checkPermission('ATS_WRITE'),
  requireAiCredits,
  aiScreeningLimiter,
  triggerResumeScreening,
);
router.get(
  '/hiring/resume-screenings',
  requireFeature('ai-hiring'),
  checkPermission('ATS_READ'),
  getResumeScreeningQueue,
);
router.get(
  '/hiring/resume-screen/:candidateId',
  requireFeature('ai-hiring'),
  checkPermission('ATS_READ'),
  getResumeScreenings,
);
router.post(
  '/hiring/generate-jd',
  requireFeature('ai-hiring'),
  checkPermission('ATS_WRITE'),
  requireAiCredits,
  aiGenerationLimiter,
  triggerGenerateJd,
);
router.post(
  '/hiring/generate-kra',
  requireFeature('ai-hiring'),
  checkPermission('ATS_WRITE'),
  requireAiCredits,
  aiGenerationLimiter,
  triggerGenerateKra,
);
router.post(
  '/hiring/interviews/:id/generate-questions',
  requireFeature('ai-hiring'),
  checkPermission('ATS_WRITE'),
  requireAiCredits,
  aiGenerationLimiter,
  triggerGenerateInterviewQuestions,
);

export default router;

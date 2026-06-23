import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import { requireFeature } from '../middleware/featureGate';
import { requireAiCredits } from '../middleware/aiCreditGate';
import { aiScreeningLimiter } from '../middleware/rateLimiter';
import { triggerResumeScreening, getResumeScreenings, getResumeScreeningQueue } from '../controllers/aiHiringController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

// Enterprise-only feature flag, gated before the RBAC/credit checks so a tenant
// without the package can't even probe whether a candidate has been screened.
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

export default router;

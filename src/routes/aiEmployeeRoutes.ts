import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import { requireFeature } from '../middleware/featureGate';
import { requireAiCredits } from '../middleware/aiCreditGate';
import { aiSummaryLimiter } from '../middleware/rateLimiter';
import { triggerEmployeeSummary, getEmployeeSummaries } from '../controllers/aiEmployeeController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

// ORG_READ — same permission already gates direct access to DisciplinaryAction/
// ComplianceRecord via hrAdminRoutes.ts; the summary narrates exactly the records the
// caller's role could already read individually, never more.
router.post(
  '/employees/:employeeId/summary',
  requireFeature('ai-employee-summary'),
  checkPermission('ORG_READ'),
  requireAiCredits,
  aiSummaryLimiter,
  triggerEmployeeSummary,
);
router.get(
  '/employees/:employeeId/summary',
  requireFeature('ai-employee-summary'),
  checkPermission('ORG_READ'),
  getEmployeeSummaries,
);

export default router;

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import {
  createAppraisal,
  getMyAppraisals,
  getTeamAppraisals,
  reviewAppraisal,
  createKRA,
  getMyKRAs
} from '../controllers/pmsController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

// Appraisals
router.post('/appraisals', createAppraisal); // Employees submitting self-appraisal
router.get('/appraisals/my', getMyAppraisals); // Employee views their own
router.get('/appraisals/team', checkPermission('ORG_READ'), getTeamAppraisals); // Managers view team appraisals
router.put('/appraisals/:id/review', checkPermission('ORG_WRITE'), reviewAppraisal); // Managers/HR review

// KRAs
router.post('/kras', checkPermission('ORG_WRITE'), createKRA); // HR/Manager sets KRAs
router.get('/kras/my', getMyKRAs); // Employee views their KRAs

export default router;

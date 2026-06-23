import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import {
  createComplianceRecord, 
  getComplianceRecords, 
  createDisciplinaryAction, 
  getDisciplinaryActions,
  assignPolicy,
  getPolicyStatuses,
  createBGVRequest,
  getBGVRequests,
  updateBGVStatus
} from '../controllers/hrAdminController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

// Compliance Records
router.post('/compliance', checkPermission('ORG_WRITE'), createComplianceRecord);
router.get('/compliance', checkPermission('ORG_READ'), getComplianceRecords);

// Disciplinary Actions
router.post('/disciplinary', checkPermission('ORG_WRITE'), createDisciplinaryAction);
router.get('/disciplinary', checkPermission('ORG_READ'), getDisciplinaryActions);

// Policy Tracking
router.post('/policies/assign', checkPermission('ORG_WRITE'), assignPolicy);
router.get('/policies', checkPermission('ORG_READ'), getPolicyStatuses);

// BGV
router.post('/bgv', checkPermission('ORG_WRITE'), createBGVRequest);
router.get('/bgv', checkPermission('ORG_READ'), getBGVRequests);
router.put('/bgv/:id', checkPermission('ORG_WRITE'), updateBGVStatus);

export default router;

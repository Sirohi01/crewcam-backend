import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import {
  EMERGENCY_PERMISSION,
  listAlerts,
  updateAlert,
  getEmergencySettings,
  updateEmergencySettings,
} from '../controllers/emergencyController';

/**
 * Responder and admin side of emergency alerts (Phase 1D-3b). The employee side
 * (view, trigger, cancel) lives under /me/emergency.
 */
const router = Router();
router.use(authenticate);
router.use(tenantResolver);

router.get('/alerts', checkPermission(EMERGENCY_PERMISSION), listAlerts);
router.patch('/alerts/:id', checkPermission(EMERGENCY_PERMISSION), updateAlert);
router.get('/settings', checkPermission([EMERGENCY_PERMISSION, 'ORG_READ']), getEmergencySettings);
router.put('/settings', checkPermission('ORG_WRITE'), updateEmergencySettings);

export default router;

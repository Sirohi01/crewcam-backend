import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import {
  setConsent, getMyConsent, pingLocation, getTeamLocations, getUserHistory,
  setRoleTrackingConfig, getRoleTrackingConfigs,
} from '../controllers/liveTrackingController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

router.put('/consent', setConsent);
router.get('/consent/mine', getMyConsent);
router.post('/ping', pingLocation);
router.get('/team', getTeamLocations);
router.get('/history/:userId', getUserHistory);

router.get('/config', checkPermission('ORG_READ'), getRoleTrackingConfigs);
router.put('/config', checkPermission('ORG_WRITE'), setRoleTrackingConfig);

export default router;

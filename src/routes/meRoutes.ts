import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import {
  getMyProfile,
  updateMyProfile,
  getMyDetails,
  updateMyDetailsSection,
  getMyBankDetails,
} from '../controllers/meController';

/**
 * Employee self-service. Routes take no user ID: every handler acts on req.user, so
 * there is nothing to tamper with to reach a colleague's record. No extra permission
 * is required — every employee may manage their own profile.
 */
const router = Router();

router.use(authenticate);
router.use(tenantResolver);

router.get('/profile', getMyProfile);
router.patch('/profile', updateMyProfile);
router.get('/details', getMyDetails);
router.put('/details/:section', updateMyDetailsSection);
router.get('/bank', getMyBankDetails);

export default router;

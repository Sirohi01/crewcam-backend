import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import {
  getMyProfile,
  updateMyProfile,
  getMyDetails,
  updateMyDetailsSection,
  getMyBankDetails,
  getMySalaryStructure,
} from '../controllers/meController';
import { cancelMyChangeRequest, createChangeRequest, getMyChangeRequests } from '../controllers/profileChangeRequestController';

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
router.get('/salary-structure', getMySalaryStructure);
// HR-owned fields (name, DOB, PAN, bank…) change only through an HR-approved request.
router.get('/change-requests', getMyChangeRequests);
router.post('/change-requests', createChangeRequest);
router.post('/change-requests/:id/cancel', cancelMyChangeRequest);

export default router;

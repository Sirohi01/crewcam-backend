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
import {
  getMyTickets,
  createMyTicket,
  rateMyTicket,
  getMyNotificationFeed,
  markMyNotificationRead,
  markAllMyNotificationsRead,
  getMyTeam,
  createPlatformReport,
  getMyAssets,
} from '../controllers/meSupportController';
import { requireFeature } from '../middleware/featureGate';
import { getMyPolicies, acknowledgeMyPolicy } from '../controllers/mePolicyController';
import { getMyRequests } from '../controllers/meRequestsController';
import { getMyEmergency, triggerMyAlert, cancelMyAlert } from '../controllers/emergencyController';

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
// Helpdesk: the employee's own tickets (HR's queue stays on /support/tickets).
router.get('/tickets', requireFeature('Helpdesk'), getMyTickets);
router.post('/tickets', requireFeature('Helpdesk'), createMyTicket);
router.post('/tickets/:id/rating', requireFeature('Helpdesk'), rateMyTicket);
router.get('/notifications', getMyNotificationFeed);
router.post('/notifications/read-all', markAllMyNotificationsRead);
router.post('/notifications/:id/read', markMyNotificationRead);
router.get('/team', getMyTeam);
// "Report a problem" → CrewCam team (not gated by the Helpdesk add-on).
router.post('/platform-reports', createPlatformReport);
router.get('/assets', getMyAssets);
// Company policies that apply to the caller, and acknowledging them.
router.get('/policies', getMyPolicies);
router.post('/policies/:id/acknowledge', acknowledgeMyPolicy);
// Everything the caller has requested, across modules.
router.get('/requests', getMyRequests);
// Emergency page: company safety info, my alerts, trigger / cancel an alert.
router.get('/emergency', getMyEmergency);
router.post('/emergency/alerts', triggerMyAlert);
router.post('/emergency/alerts/:id/cancel', cancelMyAlert);

export default router;

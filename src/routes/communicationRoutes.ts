import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import { bulkNotificationLimiter } from '../middleware/rateLimiter';
import {
  sendCommunication, getCommunicationLogs,
  createNotification, getMyNotifications, markNotificationRead,
  createDailyQuote, getDailyQuotes, getTodayQuote,
} from '../controllers/communicationController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

// For Phase 2, require ORG_WRITE to send communication to employees
router.post('/send', checkPermission('ORG_WRITE'), sendCommunication);
router.get('/logs', checkPermission('ORG_READ'), getCommunicationLogs);

router.post('/notifications', checkPermission('ORG_WRITE'), bulkNotificationLimiter, createNotification);
router.get('/notifications/mine', getMyNotifications);
router.put('/notifications/:id/read', markNotificationRead);

router.post('/daily-quotes', checkPermission('ORG_WRITE'), createDailyQuote);
router.get('/daily-quotes', checkPermission('ORG_READ'), getDailyQuotes);
router.get('/daily-quotes/today', getTodayQuote);

export default router;

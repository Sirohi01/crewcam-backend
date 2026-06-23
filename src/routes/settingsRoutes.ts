import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import {
  getActiveSessions,
  revokeSession,
  getWhitelabel,
  updateWhitelabel,
  getIntegrations,
  configureIntegration
} from '../controllers/settingsController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

// Sessions
router.get('/sessions', getActiveSessions);
router.delete('/sessions/:sessionId', revokeSession);

// Whitelabel
router.get('/whitelabel', getWhitelabel);
router.put('/whitelabel', updateWhitelabel);

// Integrations
router.get('/integrations', getIntegrations);
router.put('/integrations', configureIntegration);

export default router;

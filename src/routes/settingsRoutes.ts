import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { apiLimiter } from '../middleware/rateLimiter';
import {
  getActiveSessions,
  revokeSession,
  getPublicWhitelabel,
  getWhitelabel,
  updateWhitelabel,
  getIntegrations,
  configureIntegration,
  getTenantAiProviderOptions,
  setTenantAiProvider
} from '../controllers/settingsController';

const router = Router();

// Unauthenticated: lets the login page resolve a tenant's branding by subdomain
// before the user signs in. Must stay ahead of the authenticate/tenantResolver below.
router.get('/whitelabel/public', apiLimiter, getPublicWhitelabel);

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

// AI Provider (tenant-side switch — no keys exposed)
router.get('/ai-provider', getTenantAiProviderOptions);
router.put('/ai-provider', setTenantAiProvider);

export default router;

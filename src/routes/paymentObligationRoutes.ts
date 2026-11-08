import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { requireFeature } from '../middleware/featureGate';
import { checkPermission } from '../middleware/rbac';
import { PAYMENT_OBLIGATIONS_FEATURE } from '../utils/featureKeys';

/**
 * Payment Obligations — optional add-on. Every route here is behind the add-on's feature
 * gate, so switching it off for a package or company (or deactivating the module in the
 * catalogue) closes the whole API, not just the sidebar. The module's screens and CRUD
 * routes are built in Phase 7; until then only the status probe exists.
 */
const router = Router();

router.use(authenticate);
router.use(tenantResolver);
router.use(requireFeature(PAYMENT_OBLIGATIONS_FEATURE));

router.get('/status', checkPermission('OBLIGATIONS_READ'), (_req, res) => {
  res.json({ enabled: true, feature: PAYMENT_OBLIGATIONS_FEATURE });
});

export default router;

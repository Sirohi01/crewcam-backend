import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import { getChangeRequest, listChangeRequests, reviewChangeRequest } from '../controllers/profileChangeRequestController';

/** HR review of employees' profile change requests (Phase 1E). */
const router = Router();

router.use(authenticate);
router.use(tenantResolver);
router.use(checkPermission('EMPLOYEE_WRITE'));

router.get('/', listChangeRequests);
router.get('/:id', getChangeRequest);
router.put('/:id/review', reviewChangeRequest);

export default router;

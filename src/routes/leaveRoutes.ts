import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import {
  applyLeave, getMyLeaves, getTenantLeaves, approveRejectLeave,
  getLeaveStatistics, creditLeave,
} from '../controllers/leaveController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

router.post('/apply', applyLeave);
router.get('/my-leaves', getMyLeaves);

router.get('/tenant-leaves', checkPermission('EMPLOYEE_READ'), getTenantLeaves);
router.put('/:id/status', checkPermission('EMPLOYEE_WRITE'), approveRejectLeave);

router.get('/statistics', getLeaveStatistics);
router.post('/credit', checkPermission('EMPLOYEE_WRITE'), creditLeave);

export default router;

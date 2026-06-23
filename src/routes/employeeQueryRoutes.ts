import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import { raiseQuery, getMyQueries, getAllQueries, respondToQuery } from '../controllers/employeeQueryController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

router.post('/', raiseQuery);
router.get('/mine', getMyQueries);

router.get('/', checkPermission('EMPLOYEE_READ'), getAllQueries);
router.put('/:id/respond', checkPermission('EMPLOYEE_WRITE'), respondToQuery);

export default router;

import { Router } from 'express';
import { createEmployee, deleteEmployee, getCurrentEmployee, getEmployeeById, getEmployees, getExEmployees, updateEmployee } from '../controllers/employeeController';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import { requireFeature } from '../middleware/featureGate';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);
router.use(requireFeature('Core HR'));

router.get('/current', checkPermission('EMPLOYEE_READ'), getCurrentEmployee);
router.get('/ex', checkPermission('EMPLOYEE_READ'), getExEmployees);
router.get('/', checkPermission('EMPLOYEE_READ'), getEmployees);
router.get('/:id', checkPermission('EMPLOYEE_READ'), getEmployeeById);
router.post('/', checkPermission('EMPLOYEE_WRITE'), createEmployee);
router.put('/:id', checkPermission('EMPLOYEE_WRITE'), updateEmployee);
router.delete('/:id', checkPermission('EMPLOYEE_WRITE'), deleteEmployee);

export default router;

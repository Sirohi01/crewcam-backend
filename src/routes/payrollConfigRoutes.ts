import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { getMyPayrollCountry } from '../controllers/dropdowns/payrollCountryController';

/** The signed-in company's payroll rules (country, statutory components, tax slabs). Read-only. */
const router = Router();
router.use(authenticate);
router.use(tenantResolver);
router.get('/', getMyPayrollCountry);

export default router;

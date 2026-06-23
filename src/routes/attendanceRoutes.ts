import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import {
  clockIn, clockOut, getMyAttendance, getTenantAttendance,
  recordOutIn, getMyOutIn, getTodayAttendance, getIndividualAttendance,
  hrOverrideAttendance
} from '../controllers/attendanceController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

router.post('/clock-in', clockIn);
router.post('/clock-out', clockOut);
router.get('/my-attendance', getMyAttendance);
router.get('/tenant-attendance', checkPermission('EMPLOYEE_READ'), getTenantAttendance);

router.post('/out-in', recordOutIn);
router.get('/out-in/my', getMyOutIn);
router.get('/today', getTodayAttendance);
router.get('/individual/:userId', getIndividualAttendance);

router.post('/hr-override', checkPermission('ORG_READ'), hrOverrideAttendance);
router.put('/hr-override/:id', checkPermission('ORG_READ'), hrOverrideAttendance);

export default router;

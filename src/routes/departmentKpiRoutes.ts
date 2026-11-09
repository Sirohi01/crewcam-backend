import express from 'express';
import { createKpi, getDepartmentKpis, getKpiById, updateKpi } from '../controllers/departmentKpiController';
import { authenticate } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';

const router = express.Router();

router.use(authenticate); // Ensure user is authenticated

// Reads stay open to signed-in users; writes need KPI_WRITE (Company Admin/Admin by default).
router.post('/', checkPermission('KPI_WRITE'), createKpi);
router.get('/department/:departmentId', getDepartmentKpis);
router.get('/:id', getKpiById);
router.put('/:id', checkPermission('KPI_WRITE'), updateKpi);

export default router;

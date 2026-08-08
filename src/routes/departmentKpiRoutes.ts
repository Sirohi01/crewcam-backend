import express from 'express';
import { createKpi, getDepartmentKpis, getKpiById, updateKpi } from '../controllers/departmentKpiController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.use(authenticate); // Ensure user is authenticated

router.post('/', createKpi);
router.get('/department/:departmentId', getDepartmentKpis);
router.get('/:id', getKpiById);
router.put('/:id', updateKpi);

export default router;

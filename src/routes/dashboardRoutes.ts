import { Router } from 'express';
import { getDashboardStats, getDashboardConfig, getWidgetData } from '../controllers/dashboardController';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

router.get('/stats', getDashboardStats);
router.get('/config', getDashboardConfig);
router.get('/widget-data/:widgetKey', getWidgetData);

export default router;

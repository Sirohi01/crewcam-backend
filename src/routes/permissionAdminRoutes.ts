import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import {
  getPermissionCatalog,
  getEffectivePermissionsForUser,
  upsertPermissionOverride,
  getSidebarConfig,
  updateSidebarConfigItem,
  getDashboardWidgetConfig,
  updateDashboardWidgetConfigItem,
  getMySidebar,
} from '../controllers/permissionAdminController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);
router.get('/catalog', getPermissionCatalog);

// The actual app sidebar — every authenticated user, filtered to what they can see.
router.get('/sidebar-config/mine', getMySidebar);

// Everything else here is platform-admin (Company Admin / HR Admin) only.
router.get('/effective/:userId', checkPermission('ROLE_ADMIN'), getEffectivePermissionsForUser);
router.put('/overrides/:userId', checkPermission('ROLE_ADMIN'), upsertPermissionOverride);

router.get('/sidebar-config', checkPermission('ROLE_ADMIN'), getSidebarConfig);
router.put('/sidebar-config/:id', checkPermission('ROLE_ADMIN'), updateSidebarConfigItem);

router.get('/dashboard-config', checkPermission('ROLE_ADMIN'), getDashboardWidgetConfig);
router.put('/dashboard-config/:id', checkPermission('ROLE_ADMIN'), updateDashboardWidgetConfigItem);

export default router;

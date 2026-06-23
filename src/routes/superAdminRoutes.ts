import { Router } from 'express';
import { createFeature, createPackage, createPermission, createTenant, deleteFeature, deleteTenant, getAiUsageLogs, getAllFeatures, getAllPackages, getAllPermissions, getAllTenants, updateFeature, updatePackage, updateTenant } from '../controllers/superAdminController';
import { authenticate } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';

const router = Router();
router.use(authenticate);
router.use(checkPermission('SUPER_ADMIN'));

router.get('/tenants', getAllTenants);
router.post('/tenants', createTenant);
router.put('/tenants/:id', updateTenant);
router.delete('/tenants/:id', deleteTenant);
router.get('/packages', getAllPackages);
router.post('/packages', createPackage);
router.put('/packages/:id', updatePackage);
router.get('/permissions', getAllPermissions);
router.post('/permissions', createPermission);
router.get('/features', getAllFeatures);
router.post('/features', createFeature);
router.put('/features/:id', updateFeature);
router.delete('/features/:id', deleteFeature);
router.get('/ai-usage-logs', getAiUsageLogs);

export default router;

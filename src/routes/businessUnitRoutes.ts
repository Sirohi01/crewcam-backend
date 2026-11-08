import express from 'express';
import { createBusinessUnit, getBusinessUnits, getBusinessUnitById, updateBusinessUnit, deleteBusinessUnit } from '../controllers/businessUnitController';
import { authenticate } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';

const router = express.Router();

// Apply auth middleware to all routes in this file
router.use(authenticate);
// Assuming there might be a tenant check middleware, if not authenticate is usually enough since it sets req.tenantId

router.post('/', checkPermission('ORG_WRITE'), createBusinessUnit);
router.get('/', getBusinessUnits);
router.get('/:id', getBusinessUnitById);
router.put('/:id', checkPermission('ORG_WRITE'), updateBusinessUnit);
router.delete('/:id', checkPermission('ORG_WRITE'), deleteBusinessUnit);

export default router;

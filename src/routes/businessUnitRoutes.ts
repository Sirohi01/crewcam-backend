import express from 'express';
import { createBusinessUnit, getBusinessUnits, getBusinessUnitById, updateBusinessUnit, deleteBusinessUnit } from '../controllers/businessUnitController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Apply auth middleware to all routes in this file
router.use(authenticate);
// Assuming there might be a tenant check middleware, if not authenticate is usually enough since it sets req.tenantId

router.post('/', createBusinessUnit);
router.get('/', getBusinessUnits);
router.get('/:id', getBusinessUnitById);
router.put('/:id', updateBusinessUnit);
router.delete('/:id', deleteBusinessUnit);

export default router;

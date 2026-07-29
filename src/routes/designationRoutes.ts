import express from 'express';
import {
  getDesignations,
  getDesignationById,
  createDesignation,
  updateDesignation,
  deleteDesignation,
  getDesignationStats
} from '../controllers/designationController';
import { authenticate } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticate);

router.get('/stats', getDesignationStats);
router.route('/')
  .get(getDesignations)
  .post(checkPermission('ORG_WRITE'), createDesignation);

router.route('/:id')
  .get(getDesignationById)
  .put(checkPermission('ORG_WRITE'), updateDesignation)
  .delete(checkPermission('ORG_WRITE'), deleteDesignation);

export default router;

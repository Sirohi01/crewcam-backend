import express from 'express';
import {
  createJobFamily,
  getJobFamilies,
  getJobFamilyById,
  updateJobFamily,
  deleteJobFamily
} from '../controllers/jobFamilyController';
import { authenticate } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';

const router = express.Router();

router.use(authenticate);

router.post('/', checkPermission('ORG_WRITE'), createJobFamily);
router.get('/', getJobFamilies);
router.get('/:id', getJobFamilyById);
router.put('/:id', checkPermission('ORG_WRITE'), updateJobFamily);
router.delete('/:id', checkPermission('ORG_WRITE'), deleteJobFamily);

export default router;

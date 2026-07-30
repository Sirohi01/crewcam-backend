import express from 'express';
import {
  createJobGrade,
  getJobGrades,
  getJobGradeById,
  updateJobGrade,
  deleteJobGrade
} from '../controllers/jobGradeController';
import { authenticate } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';

const router = express.Router();

router.use(authenticate);

router.post('/', checkPermission('ORG_WRITE'), createJobGrade);
router.get('/', getJobGrades);
router.get('/:id', getJobGradeById);
router.put('/:id', checkPermission('ORG_WRITE'), updateJobGrade);
router.delete('/:id', checkPermission('ORG_WRITE'), deleteJobGrade);

export default router;

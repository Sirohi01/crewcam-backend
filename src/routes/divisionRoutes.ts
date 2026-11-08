import express from 'express';
import { authenticate } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';
import {
  getDivisions,
  getDivisionById,
  createDivision,
  updateDivision,
  deleteDivision
} from '../controllers/divisionController';

const router = express.Router();

router.use(authenticate);

router.route('/')
  .get(getDivisions)
  .post(checkPermission('ORG_WRITE'), createDivision);

router.route('/:id')
  .get(getDivisionById)
  .put(checkPermission('ORG_WRITE'), updateDivision)
  .delete(checkPermission('ORG_WRITE'), deleteDivision);

export default router;

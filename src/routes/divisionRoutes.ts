import express from 'express';
import { authenticate } from '../middleware/auth';
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
  .post(createDivision);

router.route('/:id')
  .get(getDivisionById)
  .put(updateDivision)
  .delete(deleteDivision);

export default router;

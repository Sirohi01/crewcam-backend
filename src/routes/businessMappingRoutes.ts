import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  getCostCenters, createCostCenter,
  getDepartmentDocuments, createDepartmentDocument,
  getDepartmentPolicies, createDepartmentPolicy,
  getDepartmentCustomFields, createDepartmentCustomField
} from '../controllers/businessMappingController';

const router = express.Router();

router.use(authenticate);

router.route('/cost-centers').get(getCostCenters).post(createCostCenter);
router.route('/department-documents').get(getDepartmentDocuments).post(createDepartmentDocument);
router.route('/department-policies').get(getDepartmentPolicies).post(createDepartmentPolicy);
router.route('/department-custom-fields').get(getDepartmentCustomFields).post(createDepartmentCustomField);

export default router;

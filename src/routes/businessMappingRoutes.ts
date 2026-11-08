import express from 'express';
import { authenticate } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';
import {
  getCostCenters, createCostCenter,
  getDepartmentDocuments, createDepartmentDocument,
  getDepartmentPolicies, createDepartmentPolicy,
  getDepartmentCustomFields, createDepartmentCustomField
} from '../controllers/businessMappingController';

const router = express.Router();

router.use(authenticate);

router.route('/cost-centers').get(getCostCenters).post(checkPermission('ORG_WRITE'), createCostCenter);
router.route('/department-documents').get(getDepartmentDocuments).post(checkPermission('ORG_WRITE'), createDepartmentDocument);
router.route('/department-policies').get(getDepartmentPolicies).post(checkPermission('ORG_WRITE'), createDepartmentPolicy);
router.route('/department-custom-fields').get(getDepartmentCustomFields).post(checkPermission('ORG_WRITE'), createDepartmentCustomField);

export default router;

import { Router } from 'express';
import {
  createCompanyPolicy,
  getCompanyPolicies,
  getCompanyPolicyById,
  updateCompanyPolicy,
  deleteCompanyPolicy
} from '../controllers/companyPolicyController';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import { requireFeature } from '../middleware/featureGate';

const router = Router();

// Apply global middlewares
router.use(authenticate);
router.use(tenantResolver);
router.use(requireFeature('Core HR')); // Assuming Policies sit in Core HR

const protectRead = checkPermission('MASTER_READ'); // or 'POLICY_READ' if it exists
const protectWrite = checkPermission('MASTER_WRITE'); // or 'POLICY_WRITE'

router.route('/')
  .get(protectRead, getCompanyPolicies)
  .post(protectWrite, createCompanyPolicy);

router.route('/:id')
  .get(protectRead, getCompanyPolicyById)
  .put(protectWrite, updateCompanyPolicy)
  .delete(protectWrite, deleteCompanyPolicy);

export default router;

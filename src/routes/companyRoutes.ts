import { Router } from 'express';
import { createCompanyRole, deleteCompanyRole, getCompanyRoles, getMyCompanyProfile, updateCompanyProfile, getCompanies, updateCompanyRole } from '../controllers/companyController';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import { requireFeature } from '../middleware/featureGate';

import { 
  getBranches, createBranch, deleteBranch,
  getDepartments, createDepartment, deleteDepartment,
  getDesignations, createDesignation, deleteDesignation,
  updateBranch, updateDepartment, updateDesignation
} from '../controllers/organizationController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

router.get('/profile', checkPermission('COMPANY_PROFILE_READ'), getMyCompanyProfile);
router.put('/profile', checkPermission('COMPANY_PROFILE_WRITE'), updateCompanyProfile);
router.get('/', checkPermission('COMPANY_PROFILE_READ'), getCompanies);
router.get('/roles', checkPermission('EMPLOYEE_READ'), getCompanyRoles);
router.post('/roles', checkPermission('EMPLOYEE_WRITE'), createCompanyRole);
router.put('/roles/:id', checkPermission('EMPLOYEE_WRITE'), updateCompanyRole);
router.delete('/roles/:id', checkPermission('EMPLOYEE_WRITE'), deleteCompanyRole);

// Organization Structure
router.get('/branches', requireFeature('Core HR'), checkPermission('ORG_READ'), getBranches);
router.post('/branches', requireFeature('Core HR'), checkPermission('ORG_WRITE'), createBranch);
router.put('/branches/:id', requireFeature('Core HR'), checkPermission('ORG_WRITE'), updateBranch);
router.delete('/branches/:id', requireFeature('Core HR'), checkPermission('ORG_WRITE'), deleteBranch);

router.get('/departments', requireFeature('Core HR'), checkPermission('ORG_READ'), getDepartments);
router.post('/departments', requireFeature('Core HR'), checkPermission('ORG_WRITE'), createDepartment);
router.put('/departments/:id', requireFeature('Core HR'), checkPermission('ORG_WRITE'), updateDepartment);
router.delete('/departments/:id', requireFeature('Core HR'), checkPermission('ORG_WRITE'), deleteDepartment);

router.get('/designations', requireFeature('Core HR'), checkPermission('ORG_READ'), getDesignations);
router.post('/designations', requireFeature('Core HR'), checkPermission('ORG_WRITE'), createDesignation);
router.put('/designations/:id', requireFeature('Core HR'), checkPermission('ORG_WRITE'), updateDesignation);
router.delete('/designations/:id', requireFeature('Core HR'), checkPermission('ORG_WRITE'), deleteDesignation);

export default router;

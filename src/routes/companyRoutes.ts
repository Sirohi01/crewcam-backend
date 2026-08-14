import { Router } from 'express';
import { createCompanyRole, deleteCompanyRole, getCompanyRoles, getMyCompanyProfile, updateCompanyProfile, getCompanies, updateCompanyRole } from '../controllers/companyController';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import { requireFeature } from '../middleware/featureGate';

import { 
  getBranches, getBranchById, createBranch, deleteBranch,
  getDepartments, createDepartment, deleteDepartment, getDepartmentById,
  getDesignations, createDesignation, deleteDesignation,
  updateBranch, updateDepartment, updateDesignation
} from '../controllers/organizationController';
import {
  getJobFamilies, getJobFamilyById, createJobFamily, updateJobFamily, deleteJobFamily
} from '../controllers/jobFamilyController';
import {
  getSubDepartments, getSubDepartmentById, createSubDepartment, updateSubDepartment, deleteSubDepartment
} from '../controllers/subDepartmentController';
import {
  createBudgetAllocation,
  getBudgetAllocations,
  getBudgetAllocationByDepartment
} from '../controllers/budgetAllocationController';

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
router.get('/branches/:id', requireFeature('Core HR'), checkPermission('ORG_READ'), getBranchById);
router.post('/branches', requireFeature('Core HR'), checkPermission('ORG_WRITE'), createBranch);
router.put('/branches/:id', requireFeature('Core HR'), checkPermission('ORG_WRITE'), updateBranch);
router.delete('/branches/:id', requireFeature('Core HR'), checkPermission('ORG_WRITE'), deleteBranch);

router.get('/departments', requireFeature('Core HR'), checkPermission('ORG_READ'), getDepartments);
router.get('/departments/:id', requireFeature('Core HR'), checkPermission('ORG_READ'), getDepartmentById);
router.post('/departments', requireFeature('Core HR'), checkPermission('ORG_WRITE'), createDepartment);
router.put('/departments/:id', requireFeature('Core HR'), checkPermission('ORG_WRITE'), updateDepartment);
router.delete('/departments/:id', requireFeature('Core HR'), checkPermission('ORG_WRITE'), deleteDepartment);

router.get('/sub-departments', requireFeature('Core HR'), checkPermission('ORG_READ'), getSubDepartments);
router.get('/sub-departments/:id', requireFeature('Core HR'), checkPermission('ORG_READ'), getSubDepartmentById);
router.post('/sub-departments', requireFeature('Core HR'), checkPermission('ORG_WRITE'), createSubDepartment);
router.put('/sub-departments/:id', requireFeature('Core HR'), checkPermission('ORG_WRITE'), updateSubDepartment);
router.delete('/sub-departments/:id', requireFeature('Core HR'), checkPermission('ORG_WRITE'), deleteSubDepartment);
// Department Budget Allocations
router.get('/departments/:departmentId/budget-allocations', requireFeature('Core HR'), checkPermission('ORG_READ'), getBudgetAllocationByDepartment);
router.post('/departments/budget-allocations', requireFeature('Core HR'), checkPermission('ORG_WRITE'), createBudgetAllocation);
router.get('/departments/budget-allocations', requireFeature('Core HR'), checkPermission('ORG_READ'), getBudgetAllocations);

router.get('/designations', requireFeature('Core HR'), checkPermission('ORG_READ'), getDesignations);
router.post('/designations', requireFeature('Core HR'), checkPermission('ORG_WRITE'), createDesignation);
router.put('/designations/:id', requireFeature('Core HR'), checkPermission('ORG_WRITE'), updateDesignation);
router.delete('/designations/:id', requireFeature('Core HR'), checkPermission('ORG_WRITE'), deleteDesignation);

router.get('/job-families', requireFeature('Core HR'), checkPermission('ORG_READ'), getJobFamilies);
router.get('/job-families/:id', requireFeature('Core HR'), checkPermission('ORG_READ'), getJobFamilyById);
router.post('/job-families', requireFeature('Core HR'), checkPermission('ORG_WRITE'), createJobFamily);
router.put('/job-families/:id', requireFeature('Core HR'), checkPermission('ORG_WRITE'), updateJobFamily);
router.delete('/job-families/:id', requireFeature('Core HR'), checkPermission('ORG_WRITE'), deleteJobFamily);

export default router;

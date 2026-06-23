import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import {
  saveSalaryStructure,
  getSalaryStructure,
  generateSalarySlips,
  getPayrollApprovalRequests,
  reviewPayrollApprovalRequest,
  getSalarySlips,
  createExpense,
  getExpenses,
  updateExpenseStatus,
  createAgreement,
  getAgreements,
  updateAgreementStatus
} from '../controllers/financeController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

// Payroll & Salary Structures (Finance/Admin only for writing)
router.post('/salary-structure', checkPermission('FINANCE_WRITE'), saveSalaryStructure);
router.get('/salary-structure/:employeeId', checkPermission('FINANCE_READ'), getSalaryStructure);

// Salary Slips
router.post('/salary-slips/generate', checkPermission('FINANCE_WRITE'), generateSalarySlips);
router.get('/salary-slips/approvals', checkPermission('FINANCE_READ'), getPayrollApprovalRequests);
router.put('/salary-slips/approvals/:id/review', checkPermission('FINANCE_WRITE'), reviewPayrollApprovalRequest);
router.get('/salary-slips', getSalarySlips); // Employees can fetch their own, admins fetch all

// Expenses
router.post('/expenses', createExpense); // Employees can create
router.get('/expenses', getExpenses);
router.put('/expenses/:id/status', checkPermission('FINANCE_WRITE'), updateExpenseStatus);

// Agreements
router.post('/agreements', checkPermission('FINANCE_WRITE'), createAgreement);
router.get('/agreements', checkPermission('FINANCE_READ'), getAgreements);
router.put('/agreements/:id/status', checkPermission('FINANCE_WRITE'), updateAgreementStatus);

export default router;

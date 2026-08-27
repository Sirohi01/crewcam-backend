import { Router } from 'express';
import {
    getBudgetAllocationByDepartment,
    getAllBudgetAllocations,
    getBudgetAllocationById,
    createBudgetAllocation,
    updateBudgetAllocation,
    approveBudgetAllocation,
    deleteBudgetAllocation,
} from '../controllers/budgetAllocationController';
// import { authenticate } from '../middleware/auth'; // uncomment if you gate these routes

const router = Router();

// Matches: api.get(`/companies/departments/${id}/budget-allocations`, { params: { financialYear, subDepartmentId } })
router.get('/departments/:departmentId/budget-allocations', getBudgetAllocationByDepartment);

// Matches: api.post('/companies/departments/budget-allocations', payload)
router.post('/departments/budget-allocations', createBudgetAllocation);

// Extra CRUD endpoints
router.get('/departments/budget-allocations', getAllBudgetAllocations);
router.get('/departments/budget-allocations/:id', getBudgetAllocationById);
router.put('/departments/budget-allocations/:id', updateBudgetAllocation);
router.patch('/departments/budget-allocations/:id/approve', approveBudgetAllocation);
router.delete('/departments/budget-allocations/:id', deleteBudgetAllocation);

export default router;
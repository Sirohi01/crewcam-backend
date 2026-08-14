import { Request, Response } from 'express';
import mongoose from 'mongoose';
import BudgetAllocation from '../models/BudgetAllocation';

const isValidId = (id: string) => mongoose.Types.ObjectId.isValid(id);

const computeTotals = (budgetHeads: any[] = []) =>
    budgetHeads.reduce(
        (acc, b) => ({
            annual: acc.annual + (Number(b.annual) || 0),
            q1: acc.q1 + (Number(b.q1) || 0),
            q2: acc.q2 + (Number(b.q2) || 0),
            q3: acc.q3 + (Number(b.q3) || 0),
            q4: acc.q4 + (Number(b.q4) || 0),
        }),
        { annual: 0, q1: 0, q2: 0, q3: 0, q4: 0 }
    );

/**
 * GET /companies/departments/:departmentId/budget-allocations?financialYear=...&subDepartmentId=...
 */
export const getBudgetAllocationByDepartment = async (req: Request, res: Response) => {
    try {
        const departmentId = req.params.departmentId as string;
        const financialYear = req.query.financialYear as string | undefined;
        const subDepartmentId = req.query.subDepartmentId as string | undefined;

        if (!isValidId(departmentId)) {
            return res.status(400).json({ success: false, message: 'Invalid department ID' });
        }
        if (!financialYear) {
            return res.status(400).json({ success: false, message: 'financialYear is required' });
        }
        if (subDepartmentId && !isValidId(subDepartmentId)) {
            return res.status(400).json({ success: false, message: 'Invalid subDepartmentId' });
        }

        const query: any = { departmentId, financialYear };
        query.subDepartmentId = subDepartmentId || { $exists: false };

        const allocation = await BudgetAllocation.findOne(query)
            .populate('budgetOwnerId', 'firstName lastName email')
            .populate('preparedById', 'firstName lastName email')
            .populate('approvedBy', 'firstName lastName email');

        if (!allocation) {
            return res.status(404).json({ success: false, message: 'No budget allocation found for this financial year' });
        }

        return res.status(200).json({ success: true, data: allocation });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /companies/departments/budget-allocations - list all (with optional filters)
 */
export const getAllBudgetAllocations = async (req: Request, res: Response) => {
    try {
        const departmentId = req.query.departmentId as string | undefined;
        const subDepartmentId = req.query.subDepartmentId as string | undefined;
        const financialYear = req.query.financialYear as string | undefined;
        const status = req.query.status as string | undefined;
        const page = req.query.page ? Number(req.query.page) : 1;
        const limit = req.query.limit ? Number(req.query.limit) : 50;

        const filter: any = {};
        if (departmentId) {
            if (!isValidId(departmentId)) {
                return res.status(400).json({ success: false, message: 'Invalid departmentId' });
            }
            filter.departmentId = departmentId;
        }
        if (subDepartmentId) {
            if (!isValidId(subDepartmentId)) {
                return res.status(400).json({ success: false, message: 'Invalid subDepartmentId' });
            }
            filter.subDepartmentId = subDepartmentId;
        }
        if (financialYear) filter.financialYear = financialYear;
        if (status) {
            if (!['Draft', 'Approved', 'Rejected'].includes(status)) {
                return res.status(400).json({ success: false, message: 'Invalid status' });
            }
            filter.status = status;
        }

        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            BudgetAllocation.find(filter)
                .populate('departmentId', 'name code')
                .populate('subDepartmentId', 'name code')
                .populate('budgetOwnerId', 'firstName lastName')
                .populate('preparedById', 'firstName lastName')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            BudgetAllocation.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            data,
            pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /companies/departments/budget-allocations/:id
 */
export const getBudgetAllocationById = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!isValidId(id)) {
            return res.status(400).json({ success: false, message: 'Invalid allocation ID' });
        }

        const allocation = await BudgetAllocation.findById(id)
            .populate('departmentId', 'name code')
            .populate('subDepartmentId', 'name code')
            .populate('budgetOwnerId', 'firstName lastName email')
            .populate('preparedById', 'firstName lastName email')
            .populate('approvedBy', 'firstName lastName email');

        if (!allocation) {
            return res.status(404).json({ success: false, message: 'Budget allocation not found' });
        }

        return res.status(200).json({ success: true, data: allocation });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * POST /companies/departments/budget-allocations - create or update (upsert)
 */
export const saveBudgetAllocation = async (req: Request, res: Response) => {
    try {
        const {
            departmentId,
            subDepartmentId,
            financialYear,
            budgetType,
            currency,
            allocationDate,
            budgetOwnerId,
            preparedById,
            notes,
            budgetHeads,
        } = req.body;

        if (!departmentId || !isValidId(departmentId)) {
            return res.status(400).json({ success: false, message: 'Valid departmentId is required' });
        }
        if (subDepartmentId && !isValidId(subDepartmentId)) {
            return res.status(400).json({ success: false, message: 'Invalid subDepartmentId' });
        }
        if (!financialYear) {
            return res.status(400).json({ success: false, message: 'financialYear is required' });
        }
        if (!Array.isArray(budgetHeads) || budgetHeads.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one budget head is required' });
        }
        if (budgetHeads.some((b: any) => !b.head || !b.head.trim())) {
            return res.status(400).json({ success: false, message: 'All budget heads must have a name' });
        }

        const payload = {
            departmentId,
            subDepartmentId: subDepartmentId || undefined,
            financialYear,
            budgetType,
            currency,
            allocationDate: allocationDate ? new Date(allocationDate) : new Date(),
            budgetOwnerId: budgetOwnerId || undefined,
            preparedById: preparedById || undefined,
            notes,
            budgetHeads,
            createdBy: (req as any).user?._id,
        };

        const matchQuery: any = { departmentId, financialYear };
        matchQuery.subDepartmentId = subDepartmentId || { $exists: false };

        const allocation = await BudgetAllocation.findOneAndUpdate(
            matchQuery,
            { $set: payload },
            { new: true, upsert: true, runValidators: true }
        );

        return res.status(200).json({ success: true, message: 'Budget allocation saved successfully', data: allocation });
    } catch (error: any) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Budget allocation already exists for this department & year' });
        }
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * PUT /companies/departments/budget-allocations/:id
 */
export const updateBudgetAllocation = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!isValidId(id)) {
            return res.status(400).json({ success: false, message: 'Invalid allocation ID' });
        }

        // Whitelist fields — don't let the client blindly overwrite departmentId,
        // subDepartmentId, approvedBy, etc. through this endpoint.
        const ALLOWED_FIELDS = [
            'budgetType',
            'currency',
            'allocationDate',
            'budgetOwnerId',
            'preparedById',
            'notes',
            'budgetHeads',
            'status',
            'utilizedAmount',
        ];
        const update: any = {};
        for (const field of ALLOWED_FIELDS) {
            if (req.body[field] !== undefined) update[field] = req.body[field];
        }

        if (update.status && !['Draft', 'Approved', 'Rejected'].includes(update.status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }
        if (update.utilizedAmount !== undefined && Number(update.utilizedAmount) < 0) {
            return res.status(400).json({ success: false, message: 'utilizedAmount cannot be negative' });
        }
        if (update.allocationDate) {
            update.allocationDate = new Date(update.allocationDate);
        }

        const allocation = await BudgetAllocation.findByIdAndUpdate(
            id,
            { $set: update },
            { new: true, runValidators: true }
        );

        if (!allocation) {
            return res.status(404).json({ success: false, message: 'Budget allocation not found' });
        }

        return res.status(200).json({ success: true, message: 'Budget allocation updated', data: allocation });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * PATCH /companies/departments/budget-allocations/:id/approve
 */
export const approveBudgetAllocation = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!isValidId(id)) {
            return res.status(400).json({ success: false, message: 'Invalid allocation ID' });
        }

        const { approvedBy, decision } = req.body; // decision: 'Approved' | 'Rejected'
        if (!['Approved', 'Rejected'].includes(decision)) {
            return res.status(400).json({ success: false, message: 'decision must be "Approved" or "Rejected"' });
        }
        if (approvedBy && !isValidId(approvedBy)) {
            return res.status(400).json({ success: false, message: 'Invalid approvedBy' });
        }

        const allocation = await BudgetAllocation.findByIdAndUpdate(
            id,
            {
                $set: {
                    status: decision,
                    approvedBy: approvedBy || (req as any).user?._id,
                    approvedOn: new Date(),
                },
            },
            { new: true, runValidators: true }
        );

        if (!allocation) {
            return res.status(404).json({ success: false, message: 'Budget allocation not found' });
        }

        return res.status(200).json({ success: true, message: `Budget allocation ${decision.toLowerCase()}`, data: allocation });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * DELETE /companies/departments/budget-allocations/:id
 */
export const deleteBudgetAllocation = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!isValidId(id)) {
            return res.status(400).json({ success: false, message: 'Invalid allocation ID' });
        }

        const allocation = await BudgetAllocation.findByIdAndDelete(id);
        if (!allocation) {
            return res.status(404).json({ success: false, message: 'Budget allocation not found' });
        }

        return res.status(200).json({ success: true, message: 'Budget allocation deleted' });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Exported so subDepartmentController can compute totals without re-implementing this
export { computeTotals };
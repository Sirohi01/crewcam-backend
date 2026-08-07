import { Request, Response } from 'express';
import mongoose from 'mongoose';
import BudgetAllocation from '../models/BudgetAllocation';

// GET /companies/departments/:departmentId/budget-allocations?financialYear=2025 - 2026
export const getBudgetAllocationByDepartment = async (req: Request, res: Response) => {
    try {
        const departmentId = req.params.departmentId as string;
        const financialYear = req.query.financialYear as string | undefined;

        if (!mongoose.Types.ObjectId.isValid(departmentId)) {
            return res.status(400).json({ success: false, message: 'Invalid department ID' });
        }
        if (!financialYear) {
            return res.status(400).json({ success: false, message: 'financialYear is required' });
        }

        const allocation = await BudgetAllocation.findOne({
            departmentId,
            financialYear,
        })
            .populate('budgetOwnerId', 'firstName lastName email')
            .populate('preparedById', 'firstName lastName email');

        if (!allocation) {
            return res.status(404).json({ success: false, message: 'No budget allocation found for this financial year' });
        }

        return res.status(200).json({ success: true, data: allocation });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// GET /companies/departments/budget-allocations - list all (with optional filters)
export const getAllBudgetAllocations = async (req: Request, res: Response) => {
    try {
        const departmentId = req.query.departmentId as string | undefined;
        const financialYear = req.query.financialYear as string | undefined;
        const status = req.query.status as string | undefined;
        const page = req.query.page ? Number(req.query.page) : 1;
        const limit = req.query.limit ? Number(req.query.limit) : 50;

        const filter: any = {};
        if (departmentId) filter.departmentId = departmentId;
        if (financialYear) filter.financialYear = financialYear;
        if (status) filter.status = status;

        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            BudgetAllocation.find(filter)
                .populate('departmentId', 'name code')
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
            pagination: { total, page, limit, pages: Math.ceil(total / limit) },
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// GET /companies/departments/budget-allocations/:id
export const getBudgetAllocationById = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid allocation ID' });
        }

        const allocation = await BudgetAllocation.findById(id)
            .populate('departmentId', 'name code')
            .populate('budgetOwnerId', 'firstName lastName email')
            .populate('preparedById', 'firstName lastName email');

        if (!allocation) {
            return res.status(404).json({ success: false, message: 'Budget allocation not found' });
        }

        return res.status(200).json({ success: true, data: allocation });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// POST /companies/departments/budget-allocations - create or update (upsert)
export const saveBudgetAllocation = async (req: Request, res: Response) => {
    try {
        const {
            departmentId,
            financialYear,
            budgetType,
            currency,
            allocationDate,
            budgetOwnerId,
            preparedById,
            notes,
            budgetHeads,
        } = req.body;

        if (!departmentId || !mongoose.Types.ObjectId.isValid(departmentId)) {
            return res.status(400).json({ success: false, message: 'Valid departmentId is required' });
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

        const allocation = await BudgetAllocation.findOneAndUpdate(
            { departmentId, financialYear },
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

// PUT /companies/departments/budget-allocations/:id
export const updateBudgetAllocation = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid allocation ID' });
        }

        const allocation = await BudgetAllocation.findByIdAndUpdate(
            id,
            { $set: req.body },
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

// DELETE /companies/departments/budget-allocations/:id
export const deleteBudgetAllocation = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!mongoose.Types.ObjectId.isValid(id)) {
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
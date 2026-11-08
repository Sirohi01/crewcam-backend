import { Response } from 'express';
import mongoose from 'mongoose';
import BudgetAllocation from '../models/BudgetAllocation';
import { Department } from '../models/Department';
import { AuthRequest } from '../middleware/auth';

const isValidId = (id: string) => mongoose.Types.ObjectId.isValid(id);

/**
 * BudgetAllocation has no tenantId of its own — it belongs to a tenant through its
 * department. Every query is therefore constrained to the caller's departments, so
 * an allocation ID or department ID from another company resolves to "not found".
 * Returns null when the request carries no tenant context.
 */
const tenantDepartmentIds = async (req: AuthRequest): Promise<mongoose.Types.ObjectId[] | null> => {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return null;
    const departments = await Department.find({ tenantId }).select('_id').lean();
    return departments.map((d) => d._id as mongoose.Types.ObjectId);
};

const ownsDepartment = (departmentIds: mongoose.Types.ObjectId[], departmentId: string) =>
    departmentIds.some((id) => String(id) === String(departmentId));

const missingTenant = (res: Response) =>
    res.status(401).json({ success: false, message: 'Unauthorized: tenant context missing' });

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
export const getBudgetAllocationByDepartment = async (req: AuthRequest, res: Response) => {
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

        const departmentIds = await tenantDepartmentIds(req);
        if (!departmentIds) return missingTenant(res);
        if (!ownsDepartment(departmentIds, departmentId)) {
            return res.status(404).json({ success: false, message: 'Department not found' });
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
export const getAllBudgetAllocations = async (req: AuthRequest, res: Response) => {
    try {
        const departmentId = req.query.departmentId as string | undefined;
        const subDepartmentId = req.query.subDepartmentId as string | undefined;
        const financialYear = req.query.financialYear as string | undefined;
        const status = req.query.status as string | undefined;
        const page = req.query.page ? Number(req.query.page) : 1;
        const limit = req.query.limit ? Number(req.query.limit) : 50;

        const departmentIds = await tenantDepartmentIds(req);
        if (!departmentIds) return missingTenant(res);

        const filter: any = { departmentId: { $in: departmentIds } };
        if (departmentId) {
            if (!isValidId(departmentId)) {
                return res.status(400).json({ success: false, message: 'Invalid departmentId' });
            }
            if (!ownsDepartment(departmentIds, departmentId)) {
                return res.status(404).json({ success: false, message: 'Department not found' });
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
export const getBudgetAllocationById = async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!isValidId(id)) {
            return res.status(400).json({ success: false, message: 'Invalid allocation ID' });
        }

        const departmentIds = await tenantDepartmentIds(req);
        if (!departmentIds) return missingTenant(res);
        const scopedById = { _id: id, departmentId: { $in: departmentIds } };

        const allocation = await BudgetAllocation.findOne(scopedById)
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
export const createBudgetAllocation = async (req: AuthRequest, res: Response) => {
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
        const departmentIds = await tenantDepartmentIds(req);
        if (!departmentIds) return missingTenant(res);
        if (!ownsDepartment(departmentIds, departmentId)) {
            return res.status(404).json({ success: false, message: 'Department not found' });
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
            createdBy: req.user?._id,
        };

        const matchQuery: any = { departmentId, financialYear };
        matchQuery.subDepartmentId = subDepartmentId || { $exists: false };

        const allocation = await BudgetAllocation.findOneAndUpdate(
            matchQuery,
            { $set: payload },
            { returnDocument: 'after', upsert: true, runValidators: true }
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
export const updateBudgetAllocation = async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!isValidId(id)) {
            return res.status(400).json({ success: false, message: 'Invalid allocation ID' });
        }

        const departmentIds = await tenantDepartmentIds(req);
        if (!departmentIds) return missingTenant(res);
        const scopedById = { _id: id, departmentId: { $in: departmentIds } };

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

        const allocation = await BudgetAllocation.findOneAndUpdate(
            scopedById,
            { $set: update },
            { returnDocument: 'after', runValidators: true }
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
export const approveBudgetAllocation = async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!isValidId(id)) {
            return res.status(400).json({ success: false, message: 'Invalid allocation ID' });
        }

        const departmentIds = await tenantDepartmentIds(req);
        if (!departmentIds) return missingTenant(res);
        const scopedById = { _id: id, departmentId: { $in: departmentIds } };

        const { approvedBy, decision } = req.body; // decision: 'Approved' | 'Rejected'
        if (!['Approved', 'Rejected'].includes(decision)) {
            return res.status(400).json({ success: false, message: 'decision must be "Approved" or "Rejected"' });
        }
        if (approvedBy && !isValidId(approvedBy)) {
            return res.status(400).json({ success: false, message: 'Invalid approvedBy' });
        }

        const allocation = await BudgetAllocation.findOneAndUpdate(
            scopedById,
            {
                $set: {
                    status: decision,
                    approvedBy: approvedBy || req.user?._id,
                    approvedOn: new Date(),
                },
            },
            { returnDocument: 'after', runValidators: true }
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
export const deleteBudgetAllocation = async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!isValidId(id)) {
            return res.status(400).json({ success: false, message: 'Invalid allocation ID' });
        }

        const departmentIds = await tenantDepartmentIds(req);
        if (!departmentIds) return missingTenant(res);
        const scopedById = { _id: id, departmentId: { $in: departmentIds } };

        const allocation = await BudgetAllocation.findOneAndDelete(scopedById);
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
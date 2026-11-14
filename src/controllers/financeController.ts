import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { SalaryStructure } from '../models/SalaryStructure';
import { SalarySlip } from '../models/SalarySlip';
import { Expense } from '../models/Expense';
import { Agreement } from '../models/Agreement';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { PayrollApprovalRequest } from '../models/PayrollApprovalRequest';
import { getEffectivePermissions } from '../middleware/rbac';
import { isOwnUploadUrl } from '../utils/fileStorage';
import { notifyUser } from './communicationController';

/**
 * Whether the caller may list every employee's salary slips / expenses. Everyone else
 * sees only their own. (Previously gated on `req.user.role === 'Employee'`, a field the
 * User model doesn't have — so every employee could read the whole company's payroll.)
 */
const canViewAllFinance = async (req: AuthRequest) => {
  if (req.user?.tenantId === 'SUPER_ADMIN') return true;
  const permissions = await getEffectivePermissions(req);
  return permissions.some((p) => p === '*' || p === 'SUPER_ADMIN' || p === 'FINANCE_READ');
};

const safeError = (message: string, error: any) => ({
  message,
  ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }),
});

// Salary Structure Controllers
export const saveSalaryStructure = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { employeeId } = req.body;
    
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    let structure = await SalaryStructure.findOne({ tenantId, employeeId } as any);
    
    if (structure) {
      structure = await SalaryStructure.findOneAndUpdate(
        { tenantId, employeeId } as any,
        { ...req.body },
        { returnDocument: 'after' }
      );
    } else {
      structure = await SalaryStructure.create({ ...req.body, tenantId });
    }

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'UPDATE_SALARY_STRUCTURE',
      module: 'Finance',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { employeeId }
    } as any);

    res.status(200).json(structure);
  } catch (error: any) {
    res.status(500).json(safeError('Error saving salary structure', error));
  }
};

export const getSalaryStructure = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { employeeId } = req.params;
    
    const structure = await SalaryStructure.findOne({ tenantId, employeeId } as any);
    res.status(200).json(structure || {});
  } catch (error: any) {
    res.status(500).json(safeError('Error fetching salary structure', error));
  }
};

const generateApprovedSalarySlips = async (tenantId: string, month: number, year: number, employeeIds: string[]) => {
  const structures = await SalaryStructure.find({
    tenantId,
    employeeId: { $in: employeeIds }
  } as any);

  const generatedSlips = [];

  for (const struct of structures) {
    const earnings = struct.basic + struct.hra + struct.conveyance + struct.specialAllowance;
    const deductions = struct.pfDeduction + struct.esiDeduction + struct.taxDeduction;
    const netPay = earnings - deductions;

    const slipData = {
      tenantId,
      employeeId: struct.employeeId,
      month,
      year,
      totalEarnings: earnings,
      totalDeductions: deductions,
      netPay,
      status: 'Generated',
      breakdown: {
        earnings: {
          basic: struct.basic,
          hra: struct.hra,
          conveyance: struct.conveyance,
          specialAllowance: struct.specialAllowance
        },
        deductions: {
          pf: struct.pfDeduction,
          esi: struct.esiDeduction,
          tax: struct.taxDeduction,
          other: 0
        }
      }
    };

    const slip = await SalarySlip.findOneAndUpdate(
      { tenantId, employeeId: struct.employeeId, month, year } as any,
      slipData,
      { upsert: true, returnDocument: 'after' }
    );
    
    generatedSlips.push(slip);
  }

  return generatedSlips;
};

// Payroll Generation: maker request only. Approval writes salary slips.
export const generateSalarySlips = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { month, year, employeeIds } = req.body;

    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ message: 'At least one employee is required' });
    }

    const request = await PayrollApprovalRequest.create({
      tenantId,
      employeeIds,
      month,
      year,
      status: 'Pending',
      requestedBy: req.user!._id,
      createdBy: req.user!._id,
    } as any);

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'REQUEST_SALARY_SLIP_GENERATION',
      module: 'Finance',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { requestId: (request as any)._id, month, year, employeeCount: employeeIds.length }
    } as any);

    res.status(202).json({ message: 'Payroll generation request submitted for approval', request });
  } catch (error: any) {
    res.status(500).json(safeError('Error requesting salary slip generation', error));
  }
};

export const getPayrollApprovalRequests = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const requests = await PayrollApprovalRequest.find({ tenantId } as any)
      .populate('requestedBy', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (error: any) {
    res.status(500).json(safeError('Error fetching payroll approval requests', error));
  }
};

export const reviewPayrollApprovalRequest = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const { decision, reviewerComments } = req.body;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    if (!['Approved', 'Rejected'].includes(decision)) {
      return res.status(400).json({ message: 'Decision must be Approved or Rejected' });
    }

    const request = await PayrollApprovalRequest.findOne({ _id: id, tenantId } as any);
    if (!request) return res.status(404).json({ message: 'Payroll approval request not found' });
    if (request.status !== 'Pending') return res.status(400).json({ message: 'Payroll approval request is already reviewed' });
    if (String(request.requestedBy) === String(req.user!._id)) {
      return res.status(403).json({ message: 'Maker-checker violation: requester cannot approve their own payroll generation' });
    }

    let slips: any[] = [];
    if (decision === 'Approved') {
      slips = await generateApprovedSalarySlips(String(tenantId), request.month, request.year, request.employeeIds.map(String));
      request.generatedSlipIds = slips.map((slip: any) => slip._id);
    }

    request.status = decision;
    request.reviewedBy = req.user!._id as any;
    request.reviewedAt = new Date();
    request.reviewerComments = reviewerComments;
    request.updatedBy = String(req.user!._id);
    await request.save();

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: decision === 'Approved' ? 'APPROVE_SALARY_SLIP_GENERATION' : 'REJECT_SALARY_SLIP_GENERATION',
      module: 'Finance',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { requestId: id, decision, generatedSlipCount: slips.length }
    } as any);

    res.status(200).json({ request, slips });
  } catch (error: any) {
    res.status(500).json(safeError('Error reviewing payroll approval request', error));
  }
};

export const getSalarySlips = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { month, year } = req.query;

    const query: any = { tenantId };
    if (month) query.month = month;
    if (year) query.year = year;

    if (!(await canViewAllFinance(req))) {
      query.employeeId = req.user!._id;
      // Drafts aren't final until payroll generates them; employees see issued slips only.
      query.status = { $in: ['Generated', 'Paid'] };
    }

    const slips = await SalarySlip.find(query)
      .populate('employeeId', 'firstName lastName email jobRole')
      .sort({ createdAt: -1 });

    res.status(200).json(slips);
  } catch (error: any) {
    res.status(500).json(safeError('Error fetching salary slips', error));
  }
};

// Expense & Reimbursement
export const createExpense = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    // Whitelist: the claimant must not be able to set status, approver comments or
    // another employee's id — those belong to the approval step.
    const { type, amount, date, description, receiptUrl } = req.body || {};
    if (!type || amount === undefined || !date || !description) {
      return res.status(400).json({ message: 'type, amount, date and description are required' });
    }
    if (!(Number(amount) > 0)) {
      return res.status(400).json({ message: 'amount must be greater than zero' });
    }
    const expenseDate = new Date(date);
    if (Number.isNaN(expenseDate.getTime()) || expenseDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      return res.status(400).json({ message: 'date must be a valid date, not in the future' });
    }
    if (receiptUrl && !isOwnUploadUrl(receiptUrl)) {
      return res.status(400).json({ message: 'Receipt must be uploaded through the app' });
    }

    const expense = await Expense.create({
      type,
      amount: Number(amount),
      date,
      description,
      receiptUrl,
      tenantId,
      employeeId: req.user!._id
    });

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'SUBMIT_EXPENSE',
      module: 'Finance',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { expenseId: (expense as any)._id, amount: expense.amount }
    } as any);

    res.status(201).json(expense);
  } catch (error: any) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid expense: check type, amount and date' });
    }
    res.status(500).json(safeError('Error creating expense', error));
  }
};

export const getExpenses = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const query: any = { tenantId };

    if (!(await canViewAllFinance(req))) {
      query.employeeId = req.user!._id;
    }

    const expenses = await Expense.find(query)
      .populate('employeeId', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.status(200).json(expenses);
  } catch (error: any) {
    res.status(500).json(safeError('Error fetching expenses', error));
  }
};

/** Which statuses each decision may follow. */
const EXPENSE_TRANSITIONS: Record<string, string[]> = {
  Approved: ['Pending'],
  Rejected: ['Pending'],
  Reimbursed: ['Approved'],
};

/** The employee pulls back their own claim while it is still pending. */
export const withdrawMyExpense = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, tenantId, employeeId: req.user!._id, status: 'Pending' } as any,
      { $set: { status: 'Withdrawn' } },
      { returnDocument: 'after' }
    );
    if (!expense) return res.status(404).json({ message: 'No pending claim of yours with that ID' });

    await AuditLog.create({
      tenantId, userId: req.user!._id, action: 'WITHDRAW_EXPENSE', module: 'Finance', status: 'SUCCESS',
      ipAddress: req.ip as string, userAgent: req.headers['user-agent'] as string, details: { expenseId: expense._id },
    } as any);
    res.json({ message: 'Claim withdrawn', expense });
  } catch (error: any) {
    res.status(500).json(safeError('Error withdrawing claim', error));
  }
};

export const updateExpenseStatus = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const { status, approverComments } = req.body;

    const allowedFrom = EXPENSE_TRANSITIONS[status];
    if (!allowedFrom) return res.status(400).json({ message: 'status must be Approved, Rejected or Reimbursed' });

    const existing = await Expense.findOne({ _id: id, tenantId } as any);
    if (!existing) return res.status(404).json({ message: 'Expense not found' });
    if (String(existing.employeeId) === String(req.user!._id)) {
      return res.status(403).json({ message: 'You cannot approve or reimburse your own claim' });
    }

    const expense = await Expense.findOneAndUpdate(
      { _id: id, tenantId, status: { $in: allowedFrom } } as any,
      { $set: { status, ...(approverComments !== undefined ? { approverComments: String(approverComments).slice(0, 1000) } : {}) } },
      { returnDocument: 'after' }
    );
    if (!expense) {
      return res.status(409).json({ message: `A ${existing.status.toLowerCase()} claim cannot be marked ${status.toLowerCase()}` });
    }

    await notifyUser(tenantId, existing.employeeId, req.user!._id, `Reimbursement ${status.toLowerCase()}`,
      `Your ${existing.type.toLowerCase()} claim of ₹${existing.amount.toLocaleString('en-IN')} was ${status.toLowerCase()}.`,
      '/dashboard/reimbursement');

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'UPDATE_EXPENSE_STATUS',
      module: 'Finance',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { expenseId: id, newStatus: status }
    } as any);

    res.status(200).json(expense);
  } catch (error: any) {
    res.status(500).json(safeError('Error updating expense', error));
  }
};

// Agreements
export const createAgreement = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const agreement = await Agreement.create({ ...req.body, tenantId });

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'CREATE_AGREEMENT',
      module: 'Finance',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { agreementId: (agreement as any)._id }
    } as any);

    res.status(201).json(agreement);
  } catch (error: any) {
    res.status(500).json(safeError('Error creating agreement', error));
  }
};

export const getAgreements = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const agreements = await Agreement.find({ tenantId } as any).sort({ createdAt: -1 });
    res.status(200).json(agreements);
  } catch (error: any) {
    res.status(500).json(safeError('Error fetching agreements', error));
  }
};

export const updateAgreementStatus = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const { status } = req.body;

    const agreement = await Agreement.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { status },
      { returnDocument: 'after' }
    );

    if (!agreement) return res.status(404).json({ message: 'Agreement not found' });

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'UPDATE_AGREEMENT_STATUS',
      module: 'Finance',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { agreementId: id, newStatus: status }
    } as any);

    res.status(200).json(agreement);
  } catch (error: any) {
    res.status(500).json(safeError('Error updating agreement', error));
  }
};

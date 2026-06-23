import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { SalaryStructure } from '../models/SalaryStructure';
import { SalarySlip } from '../models/SalarySlip';
import { Expense } from '../models/Expense';
import { Agreement } from '../models/Agreement';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { PayrollApprovalRequest } from '../models/PayrollApprovalRequest';

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

    // For employees, they can only see their own
    if ((req.user as any)?.role === 'Employee') {
      query.employeeId = req.user!._id;
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

    const expense = await Expense.create({
      ...req.body,
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
    res.status(500).json(safeError('Error creating expense', error));
  }
};

export const getExpenses = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const query: any = { tenantId };

    if ((req.user as any)?.role === 'Employee') {
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

export const updateExpenseStatus = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const { status, approverComments } = req.body;

    const expense = await Expense.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { status, approverComments },
      { returnDocument: 'after' }
    );

    if (!expense) return res.status(404).json({ message: 'Expense not found' });

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

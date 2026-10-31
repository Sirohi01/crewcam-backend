import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { FinancialYear } from '../../models/dropdowns/FinancialYear';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'Financial Year Management';
const DIFF_FIELDS = ['name', 'code', 'description', 'isActive'];

export const getAllFinancialYears = async (req: AuthRequest, res: Response) => {
  try {
    const data = await FinancialYear.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching financial years', error });
  }
};

export const createFinancialYear = async (req: AuthRequest, res: Response) => {
  try {
    const data = await FinancialYear.create({ ...req.body, createdBy: req.user?._id });
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_FINANCIAL_YEAR', module: MODULE, details: { name: data.name, changes } });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating financial year', error });
  }
};

export const updateFinancialYear = async (req: AuthRequest, res: Response) => {
  try {
    const before = await FinancialYear.findById(req.params.id).lean();
    const data = await FinancialYear.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    if (data) {
      const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_FINANCIAL_YEAR', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating financial year', error });
  }
};

export const deleteFinancialYear = async (req: AuthRequest, res: Response) => {
  try {
    const data = await FinancialYear.findByIdAndDelete(req.params.id);
    if (data) {
      const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'DELETE_FINANCIAL_YEAR', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ message: 'Financial Year deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting financial year', error });
  }
};

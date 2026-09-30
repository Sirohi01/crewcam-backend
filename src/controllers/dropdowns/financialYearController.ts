import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { FinancialYear } from '../../models/dropdowns/FinancialYear';

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
    const data = await FinancialYear.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
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
    await FinancialYear.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Financial Year deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting financial year', error });
  }
};

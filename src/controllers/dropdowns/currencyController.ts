import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { Currency } from '../../models/dropdowns/Currency';

export const getAllCurrencys = async (req: AuthRequest, res: Response) => {
  try {
    const data = await Currency.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching currencys', error });
  }
};

export const createCurrency = async (req: AuthRequest, res: Response) => {
  try {
    const data = await Currency.create({ ...req.body, createdBy: req.user?._id });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating currency', error });
  }
};

export const updateCurrency = async (req: AuthRequest, res: Response) => {
  try {
    const data = await Currency.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating currency', error });
  }
};

export const deleteCurrency = async (req: AuthRequest, res: Response) => {
  try {
    await Currency.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Currency deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting currency', error });
  }
};

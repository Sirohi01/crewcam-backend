import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { FirstDayOfMonth } from '../../models/dropdowns/FirstDayOfMonth';

export const getAllFirstDayOfMonths = async (req: AuthRequest, res: Response) => {
  try {
    const data = await FirstDayOfMonth.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching first day of months', error });
  }
};

export const createFirstDayOfMonth = async (req: AuthRequest, res: Response) => {
  try {
    const data = await FirstDayOfMonth.create({ ...req.body, createdBy: req.user?._id });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating first day of month', error });
  }
};

export const updateFirstDayOfMonth = async (req: AuthRequest, res: Response) => {
  try {
    const data = await FirstDayOfMonth.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating first day of month', error });
  }
};

export const deleteFirstDayOfMonth = async (req: AuthRequest, res: Response) => {
  try {
    await FirstDayOfMonth.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'First Day of Month deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting first day of month', error });
  }
};

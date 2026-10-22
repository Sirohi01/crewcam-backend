import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { DateFormat } from '../../models/dropdowns/DateFormat';

export const getAllDateFormats = async (req: AuthRequest, res: Response) => {
  try {
    const data = await DateFormat.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching date formats', error });
  }
};

export const createDateFormat = async (req: AuthRequest, res: Response) => {
  try {
    const data = await DateFormat.create({ ...req.body, createdBy: req.user?._id });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating date format', error });
  }
};

export const updateDateFormat = async (req: AuthRequest, res: Response) => {
  try {
    const data = await DateFormat.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating date format', error });
  }
};

export const deleteDateFormat = async (req: AuthRequest, res: Response) => {
  try {
    await DateFormat.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Date Format deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting date format', error });
  }
};

import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { NumberFormat } from '../../models/dropdowns/NumberFormat';

export const getAllNumberFormats = async (req: AuthRequest, res: Response) => {
  try {
    const data = await NumberFormat.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching number formats', error });
  }
};

export const createNumberFormat = async (req: AuthRequest, res: Response) => {
  try {
    const data = await NumberFormat.create({ ...req.body, createdBy: req.user?._id });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating number format', error });
  }
};

export const updateNumberFormat = async (req: AuthRequest, res: Response) => {
  try {
    const data = await NumberFormat.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating number format', error });
  }
};

export const deleteNumberFormat = async (req: AuthRequest, res: Response) => {
  try {
    await NumberFormat.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Number Format deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting number format', error });
  }
};

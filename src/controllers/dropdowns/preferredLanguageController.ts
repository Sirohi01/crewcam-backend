import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { PreferredLanguage } from '../../models/dropdowns/PreferredLanguage';

export const getAllPreferredLanguages = async (req: AuthRequest, res: Response) => {
  try {
    const data = await PreferredLanguage.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching preferred languages', error });
  }
};

export const createPreferredLanguage = async (req: AuthRequest, res: Response) => {
  try {
    const data = await PreferredLanguage.create({ ...req.body, createdBy: req.user?._id });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating preferred language', error });
  }
};

export const updatePreferredLanguage = async (req: AuthRequest, res: Response) => {
  try {
    const data = await PreferredLanguage.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating preferred language', error });
  }
};

export const deletePreferredLanguage = async (req: AuthRequest, res: Response) => {
  try {
    await PreferredLanguage.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Preferred Language deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting preferred language', error });
  }
};

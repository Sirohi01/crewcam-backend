import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { Industry } from '../../models/dropdowns/Industry';

export const getAllIndustries = async (req: AuthRequest, res: Response) => {
  try {
    const data = await Industry.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching industries', error });
  }
};

export const createIndustry = async (req: AuthRequest, res: Response) => {
  try {
    const data = await Industry.create({ ...req.body, createdBy: req.user?._id });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating industry', error });
  }
};

export const updateIndustry = async (req: AuthRequest, res: Response) => {
  try {
    const data = await Industry.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user?._id },
      { returnDocument: 'after' }
    );
    if (!data) return res.status(404).json({ message: 'Industry not found' });
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating industry', error });
  }
};

export const deleteIndustry = async (req: AuthRequest, res: Response) => {
  try {
    const data = await Industry.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ message: 'Industry not found' });
    res.status(200).json({ message: 'Industry deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting industry', error });
  }
};

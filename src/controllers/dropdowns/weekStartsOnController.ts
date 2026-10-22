import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { WeekStartsOn } from '../../models/dropdowns/WeekStartsOn';

export const getAllWeekStartsOns = async (req: AuthRequest, res: Response) => {
  try {
    const data = await WeekStartsOn.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching week starts ons', error });
  }
};

export const createWeekStartsOn = async (req: AuthRequest, res: Response) => {
  try {
    const data = await WeekStartsOn.create({ ...req.body, createdBy: req.user?._id });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating week starts on', error });
  }
};

export const updateWeekStartsOn = async (req: AuthRequest, res: Response) => {
  try {
    const data = await WeekStartsOn.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating week starts on', error });
  }
};

export const deleteWeekStartsOn = async (req: AuthRequest, res: Response) => {
  try {
    await WeekStartsOn.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Week Starts On deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting week starts on', error });
  }
};

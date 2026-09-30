import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { TimeZone } from '../../models/dropdowns/TimeZone';

export const getAllTimeZones = async (req: AuthRequest, res: Response) => {
  try {
    const data = await TimeZone.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching time zones', error });
  }
};

export const createTimeZone = async (req: AuthRequest, res: Response) => {
  try {
    const data = await TimeZone.create({ ...req.body, createdBy: req.user?._id });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating time zone', error });
  }
};

export const updateTimeZone = async (req: AuthRequest, res: Response) => {
  try {
    const data = await TimeZone.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user?._id },
      { returnDocument: 'after' }
    );
    if (!data) return res.status(404).json({ message: 'Time zone not found' });
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating time zone', error });
  }
};

export const deleteTimeZone = async (req: AuthRequest, res: Response) => {
  try {
    const data = await TimeZone.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ message: 'Time zone not found' });
    res.status(200).json({ message: 'Time zone deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting time zone', error });
  }
};

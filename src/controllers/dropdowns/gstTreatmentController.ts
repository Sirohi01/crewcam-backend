import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { GSTTreatment } from '../../models/dropdowns/GSTTreatment';

export const getAllGSTTreatments = async (req: AuthRequest, res: Response) => {
  try {
    const data = await GSTTreatment.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching gst treatments', error });
  }
};

export const createGSTTreatment = async (req: AuthRequest, res: Response) => {
  try {
    const data = await GSTTreatment.create({ ...req.body, createdBy: req.user?._id });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating gst treatment', error });
  }
};

export const updateGSTTreatment = async (req: AuthRequest, res: Response) => {
  try {
    const data = await GSTTreatment.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating gst treatment', error });
  }
};

export const deleteGSTTreatment = async (req: AuthRequest, res: Response) => {
  try {
    await GSTTreatment.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'GST Treatment deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting gst treatment', error });
  }
};

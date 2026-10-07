import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { BillingCycle } from '../../models/dropdowns/BillingCycle';

export const getAllBillingCycles = async (req: AuthRequest, res: Response) => {
  try {
    const data = await BillingCycle.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching billing cycles', error });
  }
};

export const createBillingCycle = async (req: AuthRequest, res: Response) => {
  try {
    const data = await BillingCycle.create({ ...req.body, createdBy: req.user?._id });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating billing cycle', error });
  }
};

export const updateBillingCycle = async (req: AuthRequest, res: Response) => {
  try {
    const data = await BillingCycle.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating billing cycle', error });
  }
};

export const deleteBillingCycle = async (req: AuthRequest, res: Response) => {
  try {
    await BillingCycle.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Billing Cycle deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting billing cycle', error });
  }
};

import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { CompanySize } from '../../models/dropdowns/CompanySize';

export const getAllCompanySizes = async (req: AuthRequest, res: Response) => {
  try {
    const data = await CompanySize.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching company sizes', error });
  }
};

export const createCompanySize = async (req: AuthRequest, res: Response) => {
  try {
    const data = await CompanySize.create({ ...req.body, createdBy: req.user?._id });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating company size', error });
  }
};

export const updateCompanySize = async (req: AuthRequest, res: Response) => {
  try {
    const data = await CompanySize.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user?._id },
      { returnDocument: 'after' }
    );
    if (!data) return res.status(404).json({ message: 'Company size not found' });
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating company size', error });
  }
};

export const deleteCompanySize = async (req: AuthRequest, res: Response) => {
  try {
    const data = await CompanySize.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ message: 'Company size not found' });
    res.status(200).json({ message: 'Company size deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting company size', error });
  }
};

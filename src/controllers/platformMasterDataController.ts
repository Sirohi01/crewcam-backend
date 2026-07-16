import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Industry } from '../models/Industry';
import { CompanySize } from '../models/CompanySize';
import { TimeZone } from '../models/TimeZone';

// --- Industry ---
export const getAllIndustries = async (req: AuthRequest, res: Response) => {
  try {
    const data = await Industry.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching industries', error });
  }
};

export const createIndustry = async (req: AuthRequest, res: Response) => {
  try {
    const data = await Industry.create({ ...req.body, createdBy: req.user?._id });
    res.status(201).json({ data });
  } catch (error) {
    res.status(500).json({ message: 'Error creating industry', error });
  }
};

export const updateIndustry = async (req: AuthRequest, res: Response) => {
  try {
    const data = await Industry.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user?._id },
      { new: true }
    );
    if (!data) return res.status(404).json({ message: 'Industry not found' });
    res.status(200).json({ data });
  } catch (error) {
    res.status(500).json({ message: 'Error updating industry', error });
  }
};

export const deleteIndustry = async (req: AuthRequest, res: Response) => {
  try {
    const data = await Industry.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ message: 'Industry not found' });
    res.status(200).json({ message: 'Industry deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting industry', error });
  }
};

// --- Company Size ---
export const getAllCompanySizes = async (req: AuthRequest, res: Response) => {
  try {
    const data = await CompanySize.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching company sizes', error });
  }
};

export const createCompanySize = async (req: AuthRequest, res: Response) => {
  try {
    const data = await CompanySize.create({ ...req.body, createdBy: req.user?._id });
    res.status(201).json({ data });
  } catch (error) {
    res.status(500).json({ message: 'Error creating company size', error });
  }
};

export const updateCompanySize = async (req: AuthRequest, res: Response) => {
  try {
    const data = await CompanySize.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user?._id },
      { new: true }
    );
    if (!data) return res.status(404).json({ message: 'Company size not found' });
    res.status(200).json({ data });
  } catch (error) {
    res.status(500).json({ message: 'Error updating company size', error });
  }
};

export const deleteCompanySize = async (req: AuthRequest, res: Response) => {
  try {
    const data = await CompanySize.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ message: 'Company size not found' });
    res.status(200).json({ message: 'Company size deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting company size', error });
  }
};

// --- Time Zone ---
export const getAllTimeZones = async (req: AuthRequest, res: Response) => {
  try {
    const data = await TimeZone.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching time zones', error });
  }
};

export const createTimeZone = async (req: AuthRequest, res: Response) => {
  try {
    const data = await TimeZone.create({ ...req.body, createdBy: req.user?._id });
    res.status(201).json({ data });
  } catch (error) {
    res.status(500).json({ message: 'Error creating time zone', error });
  }
};

export const updateTimeZone = async (req: AuthRequest, res: Response) => {
  try {
    const data = await TimeZone.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user?._id },
      { new: true }
    );
    if (!data) return res.status(404).json({ message: 'Time zone not found' });
    res.status(200).json({ data });
  } catch (error) {
    res.status(500).json({ message: 'Error updating time zone', error });
  }
};

export const deleteTimeZone = async (req: AuthRequest, res: Response) => {
  try {
    const data = await TimeZone.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ message: 'Time zone not found' });
    res.status(200).json({ message: 'Time zone deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting time zone', error });
  }
};

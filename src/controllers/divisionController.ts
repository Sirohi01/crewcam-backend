import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Division from '../models/Division';

export const getDivisions = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const divisions = await Division.find({ tenantId })
      .populate('businessUnit', 'name code')
      .populate('headEmployeeId', 'firstName lastName email')
      .populate('parentDivisionId', 'name code')
      .populate('reportToId', 'firstName lastName email')
      .populate('linkedDepartments', 'name code')
      .lean();
      
    res.status(200).json({ data: divisions });
  } catch (error: any) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export const getDivisionById = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const division = await Division.findOne({ _id: req.params.id, tenantId })
      .populate('businessUnit', 'name code')
      .populate('headEmployeeId', 'firstName lastName email')
      .populate('parentDivisionId', 'name code')
      .populate('reportToId', 'firstName lastName email')
      .populate('linkedDepartments', 'name code');

    if (!division) {
      return res.status(404).json({ message: 'Division not found' });
    }
    res.status(200).json({ data: division });
  } catch (error: any) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export const createDivision = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const division = new Division({ ...req.body, tenantId });
    await division.save();
    res.status(201).json({ data: division });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Division with this code already exists.' });
    }
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export const updateDivision = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const division = await Division.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!division) {
      return res.status(404).json({ message: 'Division not found' });
    }
    res.status(200).json({ data: division });
  } catch (error: any) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export const deleteDivision = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const division = await Division.findOneAndDelete({ _id: req.params.id, tenantId });

    if (!division) {
      return res.status(404).json({ message: 'Division not found' });
    }
    res.status(200).json({ message: 'Division deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

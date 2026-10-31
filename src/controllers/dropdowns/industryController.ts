import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { Industry } from '../../models/dropdowns/Industry';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'Industry Management';
const DIFF_FIELDS = ['name', 'code', 'description', 'isActive'];

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
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_INDUSTRY', module: MODULE, details: { name: data.name, changes } });
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
    const before = await Industry.findById(req.params.id).lean();
    const data = await Industry.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user?._id },
      { returnDocument: 'after' }
    );
    if (!data) return res.status(404).json({ message: 'Industry not found' });
    const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_INDUSTRY', module: MODULE, details: { name: data.name, changes } });
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
    const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'DELETE_INDUSTRY', module: MODULE, details: { name: data.name, changes } });
    res.status(200).json({ message: 'Industry deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting industry', error });
  }
};

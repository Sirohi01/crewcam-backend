import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { CoreFeature } from '../../models/dropdowns/CoreFeature';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'Core Feature Management';
const DIFF_FIELDS = ['name', 'code', 'description', 'isActive'];

export const getAllCoreFeatures = async (req: AuthRequest, res: Response) => {
  try {
    const data = await CoreFeature.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching core features', error });
  }
};

export const createCoreFeature = async (req: AuthRequest, res: Response) => {
  try {
    const data = await CoreFeature.create({ ...req.body, createdBy: req.user?._id });
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_CORE_FEATURE', module: MODULE, details: { name: data.name, changes } });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating core feature', error });
  }
};

export const updateCoreFeature = async (req: AuthRequest, res: Response) => {
  try {
    const before = await CoreFeature.findById(req.params.id).lean();
    const data = await CoreFeature.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user?._id },
      { returnDocument: 'after' }
    );
    if (!data) return res.status(404).json({ message: 'Core feature not found' });
    const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_CORE_FEATURE', module: MODULE, details: { name: data.name, changes } });
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating core feature', error });
  }
};

export const deleteCoreFeature = async (req: AuthRequest, res: Response) => {
  try {
    const data = await CoreFeature.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ message: 'Core feature not found' });
    const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'DELETE_CORE_FEATURE', module: MODULE, details: { name: data.name, changes } });
    res.status(200).json({ message: 'Core feature deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting core feature', error });
  }
};

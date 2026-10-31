import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { TimeFormat } from '../../models/dropdowns/TimeFormat';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'Time Format Management';
const DIFF_FIELDS = ['name', 'code', 'description', 'isActive'];

export const getAllTimeFormats = async (req: AuthRequest, res: Response) => {
  try {
    const data = await TimeFormat.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching time formats', error });
  }
};

export const createTimeFormat = async (req: AuthRequest, res: Response) => {
  try {
    const data = await TimeFormat.create({ ...req.body, createdBy: req.user?._id });
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_TIME_FORMAT', module: MODULE, details: { name: data.name, changes } });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating time format', error });
  }
};

export const updateTimeFormat = async (req: AuthRequest, res: Response) => {
  try {
    const before = await TimeFormat.findById(req.params.id).lean();
    const data = await TimeFormat.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    if (data) {
      const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_TIME_FORMAT', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating time format', error });
  }
};

export const deleteTimeFormat = async (req: AuthRequest, res: Response) => {
  try {
    const data = await TimeFormat.findByIdAndDelete(req.params.id);
    if (data) {
      const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'DELETE_TIME_FORMAT', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ message: 'Time Format deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting time format', error });
  }
};

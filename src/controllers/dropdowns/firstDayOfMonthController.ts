import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { FirstDayOfMonth } from '../../models/dropdowns/FirstDayOfMonth';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'First Day of Month Management';
const DIFF_FIELDS = ['name', 'code', 'description', 'isActive'];

export const getAllFirstDayOfMonths = async (req: AuthRequest, res: Response) => {
  try {
    const data = await FirstDayOfMonth.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching first day of months', error });
  }
};

export const createFirstDayOfMonth = async (req: AuthRequest, res: Response) => {
  try {
    const data = await FirstDayOfMonth.create({ ...req.body, createdBy: req.user?._id });
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_FIRST_DAY_OF_MONTH', module: MODULE, details: { name: data.name, changes } });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating first day of month', error });
  }
};

export const updateFirstDayOfMonth = async (req: AuthRequest, res: Response) => {
  try {
    const before = await FirstDayOfMonth.findById(req.params.id).lean();
    const data = await FirstDayOfMonth.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    if (data) {
      const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_FIRST_DAY_OF_MONTH', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating first day of month', error });
  }
};

export const deleteFirstDayOfMonth = async (req: AuthRequest, res: Response) => {
  try {
    const data = await FirstDayOfMonth.findByIdAndDelete(req.params.id);
    if (data) {
      const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'DELETE_FIRST_DAY_OF_MONTH', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ message: 'First Day of Month deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting first day of month', error });
  }
};

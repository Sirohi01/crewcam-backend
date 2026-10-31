import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { WeekStartsOn } from '../../models/dropdowns/WeekStartsOn';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'Week Starts On Management';
const DIFF_FIELDS = ['name', 'code', 'description', 'isActive'];

export const getAllWeekStartsOns = async (req: AuthRequest, res: Response) => {
  try {
    const data = await WeekStartsOn.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching week starts ons', error });
  }
};

export const createWeekStartsOn = async (req: AuthRequest, res: Response) => {
  try {
    const data = await WeekStartsOn.create({ ...req.body, createdBy: req.user?._id });
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_WEEK_STARTS_ON', module: MODULE, details: { name: data.name, changes } });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating week starts on', error });
  }
};

export const updateWeekStartsOn = async (req: AuthRequest, res: Response) => {
  try {
    const before = await WeekStartsOn.findById(req.params.id).lean();
    const data = await WeekStartsOn.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    if (data) {
      const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_WEEK_STARTS_ON', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating week starts on', error });
  }
};

export const deleteWeekStartsOn = async (req: AuthRequest, res: Response) => {
  try {
    const data = await WeekStartsOn.findByIdAndDelete(req.params.id);
    if (data) {
      const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'DELETE_WEEK_STARTS_ON', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ message: 'Week Starts On deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting week starts on', error });
  }
};

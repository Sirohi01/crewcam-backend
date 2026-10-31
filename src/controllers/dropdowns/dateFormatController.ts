import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { DateFormat } from '../../models/dropdowns/DateFormat';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'Date Format Management';
const DIFF_FIELDS = ['name', 'code', 'description', 'isActive'];

export const getAllDateFormats = async (req: AuthRequest, res: Response) => {
  try {
    const data = await DateFormat.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching date formats', error });
  }
};

export const createDateFormat = async (req: AuthRequest, res: Response) => {
  try {
    const data = await DateFormat.create({ ...req.body, createdBy: req.user?._id });
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_DATE_FORMAT', module: MODULE, details: { name: data.name, changes } });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating date format', error });
  }
};

export const updateDateFormat = async (req: AuthRequest, res: Response) => {
  try {
    const before = await DateFormat.findById(req.params.id).lean();
    const data = await DateFormat.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    if (data) {
      const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_DATE_FORMAT', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating date format', error });
  }
};

export const deleteDateFormat = async (req: AuthRequest, res: Response) => {
  try {
    const data = await DateFormat.findByIdAndDelete(req.params.id);
    if (data) {
      const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'DELETE_DATE_FORMAT', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ message: 'Date Format deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting date format', error });
  }
};

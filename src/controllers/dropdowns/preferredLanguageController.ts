import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { PreferredLanguage } from '../../models/dropdowns/PreferredLanguage';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'Preferred Language Management';
const DIFF_FIELDS = ['name', 'code', 'description', 'isActive'];

export const getAllPreferredLanguages = async (req: AuthRequest, res: Response) => {
  try {
    const data = await PreferredLanguage.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching preferred languages', error });
  }
};

export const createPreferredLanguage = async (req: AuthRequest, res: Response) => {
  try {
    const data = await PreferredLanguage.create({ ...req.body, createdBy: req.user?._id });
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_PREFERRED_LANGUAGE', module: MODULE, details: { name: data.name, changes } });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating preferred language', error });
  }
};

export const updatePreferredLanguage = async (req: AuthRequest, res: Response) => {
  try {
    const before = await PreferredLanguage.findById(req.params.id).lean();
    const data = await PreferredLanguage.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    if (data) {
      const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_PREFERRED_LANGUAGE', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating preferred language', error });
  }
};

export const deletePreferredLanguage = async (req: AuthRequest, res: Response) => {
  try {
    const data = await PreferredLanguage.findByIdAndDelete(req.params.id);
    if (data) {
      const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'DELETE_PREFERRED_LANGUAGE', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ message: 'Preferred Language deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting preferred language', error });
  }
};

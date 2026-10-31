import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { Currency } from '../../models/dropdowns/Currency';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'Currency Management';
const DIFF_FIELDS = ['name', 'code', 'description', 'isActive'];

export const getAllCurrencys = async (req: AuthRequest, res: Response) => {
  try {
    const data = await Currency.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching currencys', error });
  }
};

export const createCurrency = async (req: AuthRequest, res: Response) => {
  try {
    const data = await Currency.create({ ...req.body, createdBy: req.user?._id });
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_CURRENCY', module: MODULE, details: { name: data.name, changes } });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating currency', error });
  }
};

export const updateCurrency = async (req: AuthRequest, res: Response) => {
  try {
    const before = await Currency.findById(req.params.id).lean();
    const data = await Currency.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    if (data) {
      const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_CURRENCY', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating currency', error });
  }
};

export const deleteCurrency = async (req: AuthRequest, res: Response) => {
  try {
    const data = await Currency.findByIdAndDelete(req.params.id);
    if (data) {
      const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'DELETE_CURRENCY', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ message: 'Currency deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting currency', error });
  }
};

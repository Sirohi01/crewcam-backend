import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { AdvancePayment } from '../../models/dropdowns/AdvancePayment';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'Advance Payment Management';
const DIFF_FIELDS = ['name', 'code', 'description', 'isActive'];

export const getAllAdvancePayments = async (req: AuthRequest, res: Response) => {
  try {
    const data = await AdvancePayment.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching advance payments', error });
  }
};

export const createAdvancePayment = async (req: AuthRequest, res: Response) => {
  try {
    const data = await AdvancePayment.create({ ...req.body, createdBy: req.user?._id });
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_ADVANCE_PAYMENT', module: MODULE, details: { name: data.name, changes } });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating advance payment', error });
  }
};

export const updateAdvancePayment = async (req: AuthRequest, res: Response) => {
  try {
    const before = await AdvancePayment.findById(req.params.id).lean();
    const data = await AdvancePayment.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    if (data) {
      const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_ADVANCE_PAYMENT', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating advance payment', error });
  }
};

export const deleteAdvancePayment = async (req: AuthRequest, res: Response) => {
  try {
    const data = await AdvancePayment.findByIdAndDelete(req.params.id);
    if (data) {
      const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'DELETE_ADVANCE_PAYMENT', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ message: 'Advance Payment deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting advance payment', error });
  }
};

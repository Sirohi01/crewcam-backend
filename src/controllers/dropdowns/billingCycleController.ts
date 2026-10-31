import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { BillingCycle } from '../../models/dropdowns/BillingCycle';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'Billing Cycle Management';
const DIFF_FIELDS = ['name', 'code', 'period', 'description', 'isActive'];

export const getAllBillingCycles = async (req: AuthRequest, res: Response) => {
  try {
    const data = await BillingCycle.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching billing cycles', error });
  }
};

export const createBillingCycle = async (req: AuthRequest, res: Response) => {
  try {
    const data = await BillingCycle.create({ ...req.body, createdBy: req.user?._id });
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_BILLING_CYCLE', module: MODULE, details: { name: data.name, changes } });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating billing cycle', error });
  }
};

export const updateBillingCycle = async (req: AuthRequest, res: Response) => {
  try {
    const before = await BillingCycle.findById(req.params.id).lean();
    const data = await BillingCycle.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    if (data) {
      const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_BILLING_CYCLE', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating billing cycle', error });
  }
};

export const deleteBillingCycle = async (req: AuthRequest, res: Response) => {
  try {
    const data = await BillingCycle.findByIdAndDelete(req.params.id);
    if (data) {
      const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'DELETE_BILLING_CYCLE', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ message: 'Billing Cycle deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting billing cycle', error });
  }
};

import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { AddOnModule } from '../../models/dropdowns/AddOnModule';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'Add-on Module Management';
const DIFF_FIELDS = ['name', 'code', 'description', 'price', 'pricingUnit', 'badge', 'category', 'isActive'];

export const getAllAddOnModules = async (req: AuthRequest, res: Response) => {
  try {
    const data = await AddOnModule.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching add-on modules', error });
  }
};

export const createAddOnModule = async (req: AuthRequest, res: Response) => {
  try {
    const data = await AddOnModule.create({ ...req.body, createdBy: req.user?._id });
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_ADD_ON_MODULE', module: MODULE, details: { name: data.name, changes } });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating add-on module', error });
  }
};

export const updateAddOnModule = async (req: AuthRequest, res: Response) => {
  try {
    const before = await AddOnModule.findById(req.params.id).lean();
    const data = await AddOnModule.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user?._id },
      { returnDocument: 'after' }
    );
    if (!data) return res.status(404).json({ message: 'Add-on module not found' });
    const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_ADD_ON_MODULE', module: MODULE, details: { name: data.name, changes } });
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating add-on module', error });
  }
};

export const deleteAddOnModule = async (req: AuthRequest, res: Response) => {
  try {
    const data = await AddOnModule.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ message: 'Add-on module not found' });
    const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'DELETE_ADD_ON_MODULE', module: MODULE, details: { name: data.name, changes } });
    res.status(200).json({ message: 'Add-on module deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting add-on module', error });
  }
};

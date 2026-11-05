import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ModuleFeature } from '../../models/dropdowns/ModuleFeature';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'Module Features Management';
const DIFF_FIELDS = [
  'moduleId', 'name', 'code', 'description', 'type',
  'provider', 'integrationType', 'apiPlan', 'costUnit',
  'yourCost', 'sellingPrice', 'billingType', 'billingCycle',
  'usageLimitEnabled', 'unitsIncluded', 'additionalUnitCost',
  'packageTiers', 'isActive',
];

export const getAllModuleFeatures = async (req: AuthRequest, res: Response) => {
  try {
    const filter: Record<string, any> = {};
    if (req.query.moduleId) filter.moduleId = req.query.moduleId;
    const data = await ModuleFeature.find(filter)
      .populate('moduleId', 'name code category')
      .populate('createdBy', 'firstName lastName')
      .populate('updatedBy', 'firstName lastName')
      .lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists for this module' });
    }
    res.status(500).json({ message: 'Error fetching module features', error });
  }
};

export const createModuleFeature = async (req: AuthRequest, res: Response) => {
  try {
    const data = await ModuleFeature.create({ ...req.body, createdBy: req.user?._id });
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_MODULE_FEATURE', module: MODULE, details: { name: data.name, changes } });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists for this module' });
    }
    res.status(500).json({ message: 'Error creating module feature', error });
  }
};

export const updateModuleFeature = async (req: AuthRequest, res: Response) => {
  try {
    const before = await ModuleFeature.findById(req.params.id).lean();
    const data = await ModuleFeature.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user?._id },
      { returnDocument: 'after' }
    );
    if (!data) return res.status(404).json({ message: 'Module feature not found' });
    const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_MODULE_FEATURE', module: MODULE, details: { name: data.name, changes } });
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists for this module' });
    }
    res.status(500).json({ message: 'Error updating module feature', error });
  }
};

export const deleteModuleFeature = async (req: AuthRequest, res: Response) => {
  try {
    const data = await ModuleFeature.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ message: 'Module feature not found' });
    const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'DELETE_MODULE_FEATURE', module: MODULE, details: { name: data.name, changes } });
    res.status(200).json({ message: 'Module feature deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists for this module' });
    }
    res.status(500).json({ message: 'Error deleting module feature', error });
  }
};

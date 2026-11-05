import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { PlatformModule } from '../../models/dropdowns/Module';
import { ModuleFeature } from '../../models/dropdowns/ModuleFeature';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'Modules Management';
const DIFF_FIELDS = ['name', 'code', 'category', 'description', 'icon', 'isActive', 'visibleInPackages', 'isDefaultModule'];

export const getAllModules = async (req: AuthRequest, res: Response) => {
  try {
    const modules = await PlatformModule.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    const counts = await ModuleFeature.aggregate([{ $group: { _id: '$moduleId', count: { $sum: 1 } } }]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    const data = modules.map((m) => ({ ...m, featureCount: countMap.get(String(m._id)) || 0 }));
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching modules', error });
  }
};

export const createModule = async (req: AuthRequest, res: Response) => {
  try {
    const data = await PlatformModule.create({ ...req.body, createdBy: req.user?._id });
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_MODULE', module: MODULE, details: { name: data.name, changes } });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating module', error });
  }
};

export const updateModule = async (req: AuthRequest, res: Response) => {
  try {
    const before = await PlatformModule.findById(req.params.id).lean();
    const data = await PlatformModule.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user?._id },
      { returnDocument: 'after' }
    );
    if (!data) return res.status(404).json({ message: 'Module not found' });
    const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_MODULE', module: MODULE, details: { name: data.name, changes } });
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating module', error });
  }
};

export const deleteModule = async (req: AuthRequest, res: Response) => {
  try {
    const data = await PlatformModule.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ message: 'Module not found' });
    await ModuleFeature.deleteMany({ moduleId: data._id });
    const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'DELETE_MODULE', module: MODULE, details: { name: data.name, changes } });
    res.status(200).json({ message: 'Module deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting module', error });
  }
};

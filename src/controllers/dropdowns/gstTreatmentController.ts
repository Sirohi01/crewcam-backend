import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { GSTTreatment } from '../../models/dropdowns/GSTTreatment';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'GST Treatment Management';
const DIFF_FIELDS = ['name', 'code', 'description', 'isActive'];

export const getAllGSTTreatments = async (req: AuthRequest, res: Response) => {
  try {
    const data = await GSTTreatment.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching gst treatments', error });
  }
};

export const createGSTTreatment = async (req: AuthRequest, res: Response) => {
  try {
    const data = await GSTTreatment.create({ ...req.body, createdBy: req.user?._id });
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_GST_TREATMENT', module: MODULE, details: { name: data.name, changes } });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating gst treatment', error });
  }
};

export const updateGSTTreatment = async (req: AuthRequest, res: Response) => {
  try {
    const before = await GSTTreatment.findById(req.params.id).lean();
    const data = await GSTTreatment.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    if (data) {
      const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_GST_TREATMENT', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating gst treatment', error });
  }
};

export const deleteGSTTreatment = async (req: AuthRequest, res: Response) => {
  try {
    const data = await GSTTreatment.findByIdAndDelete(req.params.id);
    if (data) {
      const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'DELETE_GST_TREATMENT', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ message: 'GST Treatment deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting gst treatment', error });
  }
};

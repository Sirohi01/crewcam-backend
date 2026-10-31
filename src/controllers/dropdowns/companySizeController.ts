import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { CompanySize } from '../../models/dropdowns/CompanySize';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'Company Size Management';
const DIFF_FIELDS = ['name', 'rangeFrom', 'rangeTo', 'code', 'description', 'isActive'];

export const getAllCompanySizes = async (req: AuthRequest, res: Response) => {
  try {
    const data = await CompanySize.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching company sizes', error });
  }
};

export const createCompanySize = async (req: AuthRequest, res: Response) => {
  try {
    const data = await CompanySize.create({ ...req.body, createdBy: req.user?._id });
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_COMPANY_SIZE', module: MODULE, details: { name: data.name, changes } });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating company size', error });
  }
};

export const updateCompanySize = async (req: AuthRequest, res: Response) => {
  try {
    const before = await CompanySize.findById(req.params.id).lean();
    const data = await CompanySize.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user?._id },
      { returnDocument: 'after' }
    );
    if (!data) return res.status(404).json({ message: 'Company size not found' });
    const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_COMPANY_SIZE', module: MODULE, details: { name: data.name, changes } });
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating company size', error });
  }
};

export const deleteCompanySize = async (req: AuthRequest, res: Response) => {
  try {
    const data = await CompanySize.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ message: 'Company size not found' });
    const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'DELETE_COMPANY_SIZE', module: MODULE, details: { name: data.name, changes } });
    res.status(200).json({ message: 'Company size deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting company size', error });
  }
};

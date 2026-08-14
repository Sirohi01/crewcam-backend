import { Response } from 'express';
import { SubDepartment } from '../models/SubDepartment';
import { AuthRequest } from '../middleware/auth';
import { Department } from '../models/Department';

const tenantIdOf = (req: AuthRequest) => req.tenantId || req.user?.tenantId?.toString();
const requireTenantId = (req: AuthRequest) => {
  const tenantId = tenantIdOf(req);
  if (!tenantId) throw new Error('Tenant context is required');
  return tenantId;
};

export const getSubDepartments = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, search = '', parentDepartmentId } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const query: any = { tenantId: requireTenantId(req), isActive: true };
    if (parentDepartmentId) query.parentDepartmentId = parentDepartmentId;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const [subDepartments, total] = await Promise.all([
      SubDepartment.find(query)
        .populate('parentDepartmentId', 'name code')
        .populate('reportingToId', 'name code')
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 })
        .lean(),
      SubDepartment.countDocuments(query)
    ]);

    res.status(200).json({ 
      data: subDepartments, 
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching sub-departments', error: (error as any).message });
  }
};

export const getSubDepartmentById = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id as string;
    
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(404).json({ message: 'Sub-department not found' });
    }

    const subDepartment = await SubDepartment.findOne({ _id: id, tenantId, isActive: true } as any)
      .populate('parentDepartmentId', 'name code')
      .populate('reportingToId', 'name code')
      .lean();
    
    if (!subDepartment) return res.status(404).json({ message: 'Sub-department not found' });
    res.status(200).json({ data: subDepartment });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching sub-department', error: error.message });
  }
};

export const createSubDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    
    // Ensure parent department exists and belongs to this tenant
    const parent = await Department.findOne({ _id: req.body.parentDepartmentId, tenantId, isActive: true } as any);
    if (!parent) {
      return res.status(400).json({ message: 'Valid parent department is required' });
    }
    
    const subDepartment = new SubDepartment({
      ...req.body,
      tenantId,
      createdBy: req.user?._id
    });
    
    await subDepartment.save();
    res.status(201).json({ message: 'Sub-department created successfully', data: subDepartment });
  } catch (error: any) {
    res.status(400).json({ message: process.env.NODE_ENV === 'production' ? 'Invalid request' : error.message });
  }
};

export const updateSubDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    
    if (req.body.parentDepartmentId) {
      const parent = await Department.findOne({ _id: req.body.parentDepartmentId, tenantId, isActive: true } as any);
      if (!parent) return res.status(400).json({ message: 'Valid parent department is required' });
    }

    const { 
      name, code, shortName, description, parentDepartmentId, 
      reportingToId, businessUnit, costCenter, location, 
      isActive, effectiveDate 
    } = req.body;

    const subDepartment = await SubDepartment.findOneAndUpdate(
      { _id: req.params.id, tenantId } as any,
      { $set: { 
          name, code, shortName, description, parentDepartmentId, 
          reportingToId, businessUnit, costCenter, location, 
          isActive, effectiveDate, updatedBy: req.user?._id 
        } 
      },
      { returnDocument: 'after', runValidators: true }
    );
    
    if (!subDepartment) return res.status(404).json({ message: 'Sub-department not found' });
    res.status(200).json({ message: 'Sub-department updated successfully', data: subDepartment });
  } catch (error: any) {
    res.status(400).json({ message: process.env.NODE_ENV === 'production' ? 'Invalid request' : error.message });
  }
};

export const deleteSubDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    await SubDepartment.findOneAndUpdate({ _id: req.params.id, tenantId } as any, { isActive: false, updatedBy: req.user?._id });
    res.status(200).json({ message: 'Sub-department deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting sub-department', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

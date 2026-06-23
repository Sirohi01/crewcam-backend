import { Response } from 'express';
import { Branch } from '../models/Branch';
import { Department } from '../models/Department';
import { Designation } from '../models/Designation';
import { Tenant } from '../models/Tenant';
import { AuthRequest } from '../middleware/auth';
import mongoose from 'mongoose';

// Helper to check limits
const checkPackageLimit = async (tenantId: string, type: 'branches' | 'departments' | 'designations') => {
  const tenant = await Tenant.findById(tenantId).populate('packageId');
  if (!tenant || !tenant.packageId) throw new Error('Tenant or Package not found');
  
  const pkg: any = tenant.packageId;
  let count = 0;
  let limit = 0;

  if (type === 'branches') {
    count = await Branch.countDocuments({ tenantId });
    limit = pkg.maxBranches;
  } else if (type === 'departments') {
    count = await Department.countDocuments({ tenantId });
    limit = pkg.maxDepartments;
  } else if (type === 'designations') {
    count = await Designation.countDocuments({ tenantId });
    limit = pkg.maxDesignations;
  }

  if (count >= limit) {
    throw new Error(`Limit reached. Your package allows a maximum of ${limit} ${type}. Please upgrade to add more.`);
  }
};

const tenantIdOf = (req: AuthRequest) => req.tenantId || req.user?.tenantId?.toString();
const requireTenantId = (req: AuthRequest) => {
  const tenantId = tenantIdOf(req);
  if (!tenantId) throw new Error('Tenant context is required');
  return tenantId;
};

const normalizeId = (value: any) => value ? value.toString() : '';

const ensureBranch = async (tenantId: string, branchId: string) => {
  if (!mongoose.Types.ObjectId.isValid(branchId)) throw new Error('Valid branch is required');
  const branch = await Branch.findOne({ _id: branchId, tenantId, isActive: true } as any);
  if (!branch) throw new Error('Branch not found for this tenant');
};

const ensureDepartment = async (tenantId: string, departmentId: string) => {
  if (!mongoose.Types.ObjectId.isValid(departmentId)) throw new Error('Valid department is required');
  const department = await Department.findOne({ _id: departmentId, tenantId, isActive: true } as any);
  if (!department) throw new Error('Department not found for this tenant');
};

// ================= BRANCHES =================
export const getBranches = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const query: any = { tenantId: requireTenantId(req), isActive: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } },
        { pincode: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
        { state: { $regex: search, $options: 'i' } },
        { country: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { contactPhone: { $regex: search, $options: 'i' } },
        { contactEmail: { $regex: search, $options: 'i' } }
      ];
    }

    const [branches, total] = await Promise.all([
      Branch.find(query)
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 })
        .lean(),
      Branch.countDocuments(query)
    ]);

    res.status(200).json({ 
      data: branches, 
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching branches', error: (error as any).message });
  }
};

export const createBranch = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    await checkPackageLimit(tenantId, 'branches');
    
    const branch = new Branch({
      ...req.body,
      tenantId,
      createdBy: req.user?._id
    });
    await branch.save();
    res.status(201).json({ message: 'Branch created successfully', data: branch });
  } catch (error: any) {
    res.status(400).json({ message: process.env.NODE_ENV === 'production' ? 'Invalid request' : error.message });
  }
};

export const updateBranch = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = tenantIdOf(req);
    const { name, code, location, address, pincode, city, state, country, contactPerson, contactPhone, contactEmail, lat, lng, isActive } = req.body;
    const branch = await Branch.findOneAndUpdate(
      { _id: req.params.id, tenantId } as any,
      { $set: { name, code, location, address, pincode, city, state, country, contactPerson, contactPhone, contactEmail, lat, lng, isActive, updatedBy: req.user?._id } },
      { returnDocument: 'after', runValidators: true }
    );
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    res.status(200).json({ message: 'Branch updated successfully', data: branch });
  } catch (error: any) {
    res.status(400).json({ message: process.env.NODE_ENV === 'production' ? 'Invalid request' : error.message });
  }
};

export const deleteBranch = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const hasDepartments = await Department.exists({ tenantId, branchId: req.params.id, isActive: true } as any);
    if (hasDepartments) return res.status(400).json({ message: 'Delete departments under this branch first' });
    await Branch.findOneAndUpdate({ _id: req.params.id, tenantId } as any, { isActive: false, updatedBy: req.user?._id });
    res.status(200).json({ message: 'Branch deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting branch', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

// ================= DEPARTMENTS =================
export const getDepartments = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, search = '', branchId } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const query: any = { tenantId: requireTenantId(req), isActive: true };
    if (branchId) query.branchId = branchId;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const [departments, total] = await Promise.all([
      Department.find(query)
        .populate('branchId')
        .populate('hodEmployeeId', 'firstName lastName email')
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 })
        .lean(),
      Department.countDocuments(query)
    ]);

    res.status(200).json({ 
      data: departments, 
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching departments', error: (error as any).message });
  }
};

export const createDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    await checkPackageLimit(tenantId, 'departments');
    await ensureBranch(tenantId, req.body.branchId);
    
    const department = new Department({
      ...req.body,
      tenantId,
      createdBy: req.user?._id
    });
    await department.save();
    res.status(201).json({ message: 'Department created successfully', data: department });
  } catch (error: any) {
    res.status(400).json({ message: process.env.NODE_ENV === 'production' ? 'Invalid request' : error.message });
  }
};

export const updateDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    if (req.body.branchId) await ensureBranch(tenantId, req.body.branchId);
    const { name, code, branchId, description, isActive } = req.body;
    const department = await Department.findOneAndUpdate(
      { _id: req.params.id, tenantId } as any,
      { $set: { name, code, branchId, description, isActive, updatedBy: req.user?._id } },
      { returnDocument: 'after', runValidators: true }
    );
    if (!department) return res.status(404).json({ message: 'Department not found' });
    res.status(200).json({ message: 'Department updated successfully', data: department });
  } catch (error: any) {
    res.status(400).json({ message: process.env.NODE_ENV === 'production' ? 'Invalid request' : error.message });
  }
};

export const deleteDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const hasDesignations = await Designation.exists({ tenantId, departmentId: req.params.id, isActive: true } as any);
    if (hasDesignations) return res.status(400).json({ message: 'Delete designations under this department first' });
    await Department.findOneAndUpdate({ _id: req.params.id, tenantId } as any, { isActive: false, updatedBy: req.user?._id });
    res.status(200).json({ message: 'Department deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting department', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

// ================= DESIGNATIONS =================
export const getDesignations = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, search = '', departmentId } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const query: any = { tenantId: requireTenantId(req), isActive: true };
    if (departmentId) query.departmentId = departmentId;
    if (search) {
      const orConditions: any[] = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
      if (!isNaN(Number(search))) {
        orConditions.push({ level: Number(search) });
      }
      query.$or = orConditions;
    }

    const [designations, total] = await Promise.all([
      Designation.find(query)
        .populate('departmentId')
        .populate('reportingToEmployeeId', 'firstName lastName email')
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 })
        .lean(),
      Designation.countDocuments(query)
    ]);

    res.status(200).json({ 
      data: designations, 
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching designations', error: (error as any).message });
  }
};

export const createDesignation = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    await checkPackageLimit(tenantId, 'designations');
    await ensureDepartment(tenantId, req.body.departmentId);
    
    const designation = new Designation({
      ...req.body,
      tenantId,
      createdBy: req.user?._id
    });
    await designation.save();
    res.status(201).json({ message: 'Designation created successfully', data: designation });
  } catch (error: any) {
    res.status(400).json({ message: process.env.NODE_ENV === 'production' ? 'Invalid request' : error.message });
  }
};

export const updateDesignation = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    if (req.body.departmentId) await ensureDepartment(tenantId, req.body.departmentId);
    const { name, code, level, departmentId, isActive } = req.body;
    const designation = await Designation.findOneAndUpdate(
      { _id: req.params.id, tenantId } as any,
      { $set: { name, code, level, departmentId, isActive, updatedBy: req.user?._id } },
      { returnDocument: 'after', runValidators: true }
    );
    if (!designation) return res.status(404).json({ message: 'Designation not found' });
    res.status(200).json({ message: 'Designation updated successfully', data: designation });
  } catch (error: any) {
    res.status(400).json({ message: process.env.NODE_ENV === 'production' ? 'Invalid request' : error.message });
  }
};

export const deleteDesignation = async (req: AuthRequest, res: Response) => {
  try {
    await Designation.findOneAndUpdate({ _id: req.params.id, tenantId: requireTenantId(req) } as any, { isActive: false, updatedBy: req.user?._id });
    res.status(200).json({ message: 'Designation deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting designation', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

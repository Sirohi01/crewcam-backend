import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { JobFamily } from '../models/JobFamily';

const tenantIdOf = (req: AuthRequest) => req.tenantId || req.user?.tenantId?.toString();
const requireTenantId = (req: AuthRequest) => {
  const tenantId = tenantIdOf(req);
  if (!tenantId) throw new Error('Tenant context is required');
  return tenantId;
};

export const getJobFamilies = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query: any = { tenantId: requireTenantId(req), isActive: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const [families, total] = await Promise.all([
      JobFamily.find(query)
        .populate('parentFamilyId', 'name code')
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 })
        .lean(),
      JobFamily.countDocuments(query),
    ]);

    res.status(200).json({
      data: families,
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching job families', error: (error as any).message });
  }
};

export const getJobFamilyById = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const family = await JobFamily.findOne({ _id: req.params.id, tenantId, isActive: true } as any)
      .populate('parentFamilyId', 'name code')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .lean();
    if (!family) return res.status(404).json({ message: 'Job family not found' });
    res.status(200).json({ data: family });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching job family', error: error.message });
  }
};

export const createJobFamily = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const family = new JobFamily({
      ...req.body,
      tenantId,
      createdBy: req.user?._id,
    });
    await family.save();
    res.status(201).json({ message: 'Job family created successfully', data: family });
  } catch (error: any) {
    res.status(400).json({ message: process.env.NODE_ENV === 'production' ? 'Invalid request' : error.message });
  }
};

export const updateJobFamily = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const { name, code, description, parentFamilyId, businessUnit, keyResponsibilities, isActive } = req.body;
    const family = await JobFamily.findOneAndUpdate(
      { _id: req.params.id, tenantId } as any,
      { $set: { name, code, description, parentFamilyId, businessUnit, keyResponsibilities, isActive, updatedBy: req.user?._id } },
      { returnDocument: 'after', runValidators: true },
    );
    if (!family) return res.status(404).json({ message: 'Job family not found' });
    res.status(200).json({ message: 'Job family updated successfully', data: family });
  } catch (error: any) {
    res.status(400).json({ message: process.env.NODE_ENV === 'production' ? 'Invalid request' : error.message });
  }
};

export const deleteJobFamily = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const hasChildren = await JobFamily.exists({ tenantId, parentFamilyId: req.params.id, isActive: true } as any);
    if (hasChildren) return res.status(400).json({ message: 'Delete child job families first' });
    await JobFamily.findOneAndUpdate({ _id: req.params.id, tenantId } as any, { isActive: false, updatedBy: req.user?._id });
    res.status(200).json({ message: 'Job family deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting job family', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

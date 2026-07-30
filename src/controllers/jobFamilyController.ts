import { Request, Response } from 'express';
import { JobFamily } from '../models/JobFamily';
import { AuditLog } from '../models/AuditLog';

async function writeAudit(action: string, userId: any, tenantId: string, details: Record<string, any>) {
  try {
    await AuditLog.create({ tenantId, userId, action, module: 'Organization', status: 'SUCCESS', details } as any);
  } catch (err) {
    console.error('[audit] failed to write job family audit log:', err);
  }
}

export const createJobFamily = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user.tenantId;
    const { name, code, description, isActive, parentFamily, businessUnitId, keyResponsibilities } = req.body;

    const existing = await JobFamily.findOne({ tenantId, code });
    if (existing) {
      return res.status(400).json({ message: 'Job family code already exists' });
    }

    const jobFamily = new JobFamily({
      tenantId,
      name,
      code,
      description,
      isActive: isActive !== undefined ? isActive : true,
      keyResponsibilities,
      ...(parentFamily && { parentFamily }),
      ...(businessUnitId && { businessUnitId })
    });

    await jobFamily.save();
    await writeAudit('CREATE_JOB_FAMILY', (req as any).user?._id, tenantId, { name: jobFamily.name, code: jobFamily.code });
    res.status(201).json(jobFamily);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getJobFamilies = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user.tenantId;
    const jobFamilies = await JobFamily.find({ tenantId })
      .populate({ path: 'parentFamily', select: 'name code' })
      .populate({ path: 'businessUnitId', select: 'name code' })
      .sort({ createdAt: -1 });
    res.json(jobFamilies);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getJobFamilyById = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user.tenantId;
    const { id } = req.params;

    const jobFamily = await JobFamily.findOne({ _id: id, tenantId } as any)
      .populate({ path: 'parentFamily', select: 'name code' })
      .populate({ path: 'businessUnitId', select: 'name code' });
    if (!jobFamily) {
      return res.status(404).json({ message: 'Job family not found' });
    }
    res.json(jobFamily);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateJobFamily = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user.tenantId;
    const { id } = req.params;
    const updateData = req.body;

    const jobFamily = await JobFamily.findOneAndUpdate(
      { _id: id, tenantId } as any,
      updateData,
      { new: true }
    );

    if (!jobFamily) {
      return res.status(404).json({ message: 'Job family not found' });
    }

    await writeAudit('UPDATE_JOB_FAMILY', (req as any).user?._id, tenantId, { name: jobFamily.name, code: jobFamily.code });

    res.json(jobFamily);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteJobFamily = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user.tenantId;
    const { id } = req.params;

    const jobFamily = await JobFamily.findOneAndDelete({ _id: id, tenantId } as any);
    if (!jobFamily) {
      return res.status(404).json({ message: 'Job family not found' });
    }

    await writeAudit('DELETE_JOB_FAMILY', (req as any).user?._id, tenantId, { name: jobFamily.name, code: jobFamily.code });

    res.json({ message: 'Job family deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

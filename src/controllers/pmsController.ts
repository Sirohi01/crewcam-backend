import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Appraisal } from '../models/Appraisal';
import { KRA } from '../models/KRA';
import { AuditLog } from '../models/AuditLog';

// Appraisal Controllers
export const createAppraisal = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    // Ensure self-rating is submitted by the employee themselves
    const appraisal = await Appraisal.create({
      ...req.body,
      tenantId,
      employeeId: req.user!._id,
      status: 'Self_Submitted'
    });

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'SUBMIT_SELF_APPRAISAL',
      module: 'PMS',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { appraisalId: (appraisal as any)._id }
    } as any);

    res.status(201).json(appraisal);
  } catch (error: any) {
    res.status(500).json({ message: 'Error submitting appraisal', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getMyAppraisals = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const appraisals = await Appraisal.find({ tenantId, employeeId: req.user!._id } as any);
    res.status(200).json(appraisals);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching appraisals', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getTeamAppraisals = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    // Basic implementation: fetch all non-pending appraisals. 
    // In production, we would filter by HOD's department structure.
    const appraisals = await Appraisal.find({ tenantId, status: { $ne: 'Pending' } } as any)
      .populate('employeeId', 'firstName lastName email');
    res.status(200).json(appraisals);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching team appraisals', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const reviewAppraisal = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    const { hodRating, hodComments, hrRating, hrComments, status } = req.body;

    const appraisal = await Appraisal.findOneAndUpdate(
      { _id: id, tenantId } as any,
      {
        ...(hodRating && { hodRating, hodComments, hodId: req.user!._id }),
        ...(hrRating && { hrRating, hrComments, hrId: req.user!._id }),
        ...(status && { status })
      },
      { returnDocument: 'after' }
    );

    if (!appraisal) return res.status(404).json({ message: 'Appraisal not found' });

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'REVIEW_APPRAISAL',
      module: 'PMS',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { appraisalId: id, newStatus: status }
    } as any);

    res.status(200).json(appraisal);
  } catch (error: any) {
    res.status(500).json({ message: 'Error reviewing appraisal', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

// KRA Controllers
export const createKRA = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const kra = await KRA.create({ ...req.body, tenantId });
    res.status(201).json(kra);
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating KRA', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getMyKRAs = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const kras = await KRA.find({ tenantId, employeeId: req.user!._id } as any);
    res.status(200).json(kras);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching KRAs', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

import { Request, Response } from 'express';
import { JobGrade } from '../models/JobGrade';

export const createJobGrade = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user.tenantId;
    const { name, code, description, level, isActive, jobFamily, parentGrade, payRange, ctcRangeMin, ctcRangeMax, probationPeriod } = req.body;

    const existing = await JobGrade.findOne({ tenantId, code });
    if (existing) {
      return res.status(400).json({ message: 'Job grade code already exists' });
    }

    const jobGrade = new JobGrade({
      tenantId,
      name,
      code,
      description,
      level,
      isActive: isActive !== undefined ? isActive : true,
      ...(jobFamily && { jobFamily }),
      ...(parentGrade && { parentGrade }),
      payRange,
      ctcRangeMin,
      ctcRangeMax,
      probationPeriod
    });

    await jobGrade.save();
    res.status(201).json(jobGrade);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getJobGrades = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user.tenantId;
    const jobGrades = await JobGrade.find({ tenantId })
      .populate('jobFamily', 'name code')
      .populate('parentGrade', 'name code')
      .sort({ createdAt: -1 });
    res.json(jobGrades);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getJobGradeById = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user.tenantId;
    const { id } = req.params;

    const jobGrade = await JobGrade.findOne({ _id: id, tenantId } as any)
      .populate('jobFamily', 'name code')
      .populate('parentGrade', 'name code');
    if (!jobGrade) {
      return res.status(404).json({ message: 'Job grade not found' });
    }
    res.json(jobGrade);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateJobGrade = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user.tenantId;
    const { id } = req.params;
    const updateData = req.body;

    const jobGrade = await JobGrade.findOneAndUpdate(
      { _id: id, tenantId } as any,
      updateData,
      { new: true }
    );

    if (!jobGrade) {
      return res.status(404).json({ message: 'Job grade not found' });
    }

    res.json(jobGrade);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteJobGrade = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user.tenantId;
    const { id } = req.params;

    const jobGrade = await JobGrade.findOneAndDelete({ _id: id, tenantId } as any);
    if (!jobGrade) {
      return res.status(404).json({ message: 'Job grade not found' });
    }

    res.json({ message: 'Job grade deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

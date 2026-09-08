import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Designation } from '../models/Designation';
import { AuthRequest } from '../middleware/auth';

export const getDesignations = async (req: AuthRequest, res: Response) => {
  try {
    const designations = await Designation.find({ tenantId: req.user!.tenantId })
      .populate('departmentId', 'name code')
      .populate('reportsToDesignationId', 'name code')
      .populate('jobGrade', 'name code level')
      .populate('jobFamily', 'name code')
      .sort({ createdAt: -1 });
    res.json(designations);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getDesignationById = async (req: AuthRequest, res: Response) => {
  try {
    const designation = await Designation.findOne({ _id: req.params.id, tenantId: req.user!.tenantId } as any)
      .populate('departmentId', 'name code')
      .populate('reportsToDesignationId', 'name code')
      .populate('jobGrade', 'name code level')
      .populate('jobFamily', 'name code');
    if (!designation) return res.status(404).json({ message: 'Designation not found' });
    res.json(designation);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createDesignation = async (req: AuthRequest, res: Response) => {
  try {
    if (req.body.reportsToDesignationId !== undefined) {
      if (!req.body.reportsToDesignationId || !mongoose.Types.ObjectId.isValid(req.body.reportsToDesignationId)) {
        req.body.reportsToDesignationId = null;
      }
    }
    if (req.body.departmentId !== undefined) {
      if (!req.body.departmentId || !mongoose.Types.ObjectId.isValid(req.body.departmentId)) {
        req.body.departmentId = null;
      }
    }
    if (req.body.jobGrade !== undefined) {
      if (!req.body.jobGrade || !mongoose.Types.ObjectId.isValid(req.body.jobGrade)) {
        req.body.jobGrade = null;
      }
    }
    if (req.body.jobFamily !== undefined) {
      if (!req.body.jobFamily || !mongoose.Types.ObjectId.isValid(req.body.jobFamily)) {
        req.body.jobFamily = null;
      }
    }

    const newDesignation = new Designation({
      ...req.body,
      tenantId: req.user!.tenantId,
    });
    const saved = await newDesignation.save();
    res.status(201).json(saved);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const updateDesignation = async (req: AuthRequest, res: Response) => {
  try {
    if (req.body.reportsToDesignationId !== undefined) {
      if (!req.body.reportsToDesignationId || !mongoose.Types.ObjectId.isValid(req.body.reportsToDesignationId)) {
        req.body.reportsToDesignationId = null;
      }
    }
    if (req.body.departmentId !== undefined) {
      if (!req.body.departmentId || !mongoose.Types.ObjectId.isValid(req.body.departmentId)) {
        req.body.departmentId = null;
      }
    }
    if (req.body.jobGrade !== undefined) {
      if (!req.body.jobGrade || !mongoose.Types.ObjectId.isValid(req.body.jobGrade)) {
        req.body.jobGrade = null;
      }
    }
    if (req.body.jobFamily !== undefined) {
      if (!req.body.jobFamily || !mongoose.Types.ObjectId.isValid(req.body.jobFamily)) {
        req.body.jobFamily = null;
      }
    }

    const updated = await Designation.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId } as any,
      { $set: req.body },
      { returnDocument: 'after' }
    );
    if (!updated) return res.status(404).json({ message: 'Designation not found' });
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteDesignation = async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await Designation.findOneAndDelete({ _id: req.params.id, tenantId: req.user!.tenantId } as any);
    if (!deleted) return res.status(404).json({ message: 'Designation not found' });
    res.json({ message: 'Designation deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getDesignationStats = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const total = await Designation.countDocuments({ tenantId });
    const active = await Designation.countDocuments({ tenantId, isActive: true });
    
    const familyCounts = await Designation.aggregate([
      { $match: { tenantId } },
      { $group: { _id: "$jobFamily", count: { $sum: 1 } } }
    ]);

    const gradeCounts = await Designation.aggregate([
      { $match: { tenantId, jobGrade: { $ne: null } } },
      { $group: { _id: "$jobGrade", count: { $sum: 1 } } },
      { $sort: { _id: -1 } }
    ]);

    res.json({
      total,
      active,
      inactive: total - active,
      employees: 0,
      vacant: 0,
      uniqueJobGrades: gradeCounts.length,
      familyCounts: familyCounts.map(f => ({ name: f._id || 'Unassigned', count: f.count })),
      gradeCounts: gradeCounts.map(g => ({ grade: g._id || 'Unassigned', count: g.count }))
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

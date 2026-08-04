import { Request, Response } from 'express';
import { DepartmentKpi } from '../models/DepartmentKpi';
import { Types } from 'mongoose';

// @desc    Create a new Department KPI
// @route   POST /api/v1/department-kpis
// @access  Private
export const createKpi = async (req: Request, res: Response): Promise<void> => {
  try {
    const kpiData = {
      ...req.body,
      companyId: req.user?.companyId, // Assumes authMiddleware sets req.user
      createdBy: req.user?._id
    };

    const kpi = await DepartmentKpi.create(kpiData);

    res.status(201).json({
      success: true,
      data: kpi
    });
  } catch (error: any) {
    console.error('Error creating KPI:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create KPI',
      error: error.message
    });
  }
};

// @desc    Get KPIs for a specific department
// @route   GET /api/v1/department-kpis/department/:departmentId
// @access  Private
export const getDepartmentKpis = async (req: Request, res: Response): Promise<void> => {
  try {
    const { departmentId } = req.params;
    
    if (!Types.ObjectId.isValid(departmentId)) {
       res.status(400).json({ success: false, message: 'Invalid department ID' });
       return;
    }

    const kpis = await DepartmentKpi.find({
      departmentId,
      companyId: req.user?.companyId
    }).populate('createdBy', 'firstName lastName avatarUrl').sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: kpis
    });
  } catch (error: any) {
    console.error('Error fetching KPIs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch KPIs',
      error: error.message
    });
  }
};

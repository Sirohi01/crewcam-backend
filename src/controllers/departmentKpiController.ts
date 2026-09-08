import { Request, Response } from 'express';
import { DepartmentKpi } from '../models/DepartmentKpi';
import { Types } from 'mongoose';

// @desc    Create a new Department KPI
// @route   POST /api/v1/department-kpis
// @access  Private
export const createKpi = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    const kpiData = {
      ...req.body,
      companyId: tenantId, 
      createdBy: (req as any).user?._id
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
    
    if (!Types.ObjectId.isValid(departmentId as string)) {
       res.status(400).json({ success: false, message: 'Invalid department ID' });
       return;
    }

    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    const kpis = await DepartmentKpi.find({
      departmentId: departmentId as string,
      companyId: tenantId
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

// @desc    Get a specific KPI by ID
// @route   GET /api/v1/department-kpis/:id
// @access  Private
export const getKpiById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!Types.ObjectId.isValid(id as string)) {
       res.status(400).json({ success: false, message: 'Invalid KPI ID' });
       return;
    }

    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    const kpi = await DepartmentKpi.findOne({
      _id: id as string,
      companyId: tenantId
    }).populate('createdBy', 'firstName lastName avatarUrl');

    if (!kpi) {
      res.status(404).json({ success: false, message: 'KPI not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: kpi
    });
  } catch (error: any) {
    console.error('Error fetching KPI:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch KPI',
      error: error.message
    });
  }
};

// @desc    Update a specific KPI by ID
// @route   PUT /api/v1/department-kpis/:id
// @access  Private
export const updateKpi = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!Types.ObjectId.isValid(id as string)) {
       res.status(400).json({ success: false, message: 'Invalid KPI ID' });
       return;
    }

    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    const kpiData = {
      ...req.body
    };

    const kpi = await DepartmentKpi.findOneAndUpdate(
      { _id: id as string, companyId: tenantId },
      kpiData,
      { returnDocument: 'after', runValidators: true }
    );

    if (!kpi) {
      res.status(404).json({ success: false, message: 'KPI not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: kpi
    });
  } catch (error: any) {
    console.error('Error updating KPI:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update KPI',
      error: error.message
    });
  }
};

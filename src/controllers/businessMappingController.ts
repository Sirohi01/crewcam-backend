import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import CostCenter from '../models/businessMapping/CostCenter';
import DepartmentDocument from '../models/DepartmentDocument';
import DepartmentPolicy from '../models/DepartmentPolicy';
import DepartmentCustomField from '../models/DepartmentCustomField';

// Cost Centers
export const getCostCenters = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const costCenters = await CostCenter.find({ tenantId });
    res.status(200).json({ data: costCenters });
  } catch (error: any) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export const createCostCenter = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const costCenter = new CostCenter({ ...req.body, tenantId });
    await costCenter.save();
    res.status(201).json({ data: costCenter });
  } catch (error: any) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// Department Documents
export const getDepartmentDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { departmentId } = req.query;
    const filter: any = { tenantId };
    if (departmentId) filter.departmentId = departmentId;
    
    const docs = await DepartmentDocument.find(filter);
    res.status(200).json({ data: docs });
  } catch (error: any) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export const createDepartmentDocument = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const doc = new DepartmentDocument({ ...req.body, tenantId });
    await doc.save();
    res.status(201).json({ data: doc });
  } catch (error: any) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// Department Policies
export const getDepartmentPolicies = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { departmentId } = req.query;
    const filter: any = { tenantId };
    if (departmentId) filter.departmentId = departmentId;

    const policies = await DepartmentPolicy.find(filter);
    res.status(200).json({ data: policies });
  } catch (error: any) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export const createDepartmentPolicy = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const policy = new DepartmentPolicy({ ...req.body, tenantId });
    await policy.save();
    res.status(201).json({ data: policy });
  } catch (error: any) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// Department Custom Fields
export const getDepartmentCustomFields = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { departmentId } = req.query;
    const filter: any = { tenantId };
    if (departmentId) filter.departmentId = departmentId;

    const fields = await DepartmentCustomField.find(filter);
    res.status(200).json({ data: fields });
  } catch (error: any) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export const createDepartmentCustomField = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const field = new DepartmentCustomField({ ...req.body, tenantId });
    await field.save();
    res.status(201).json({ data: field });
  } catch (error: any) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

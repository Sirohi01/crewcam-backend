import { Request, Response } from 'express';
import { CompanyPolicy } from '../models/CompanyPolicy';

export const createCompanyPolicy = async (req: Request, res: Response) => {
  try {
    const { tenantId, user } = req as any;
    
    // Ensure uniqueness of code within tenant
    const existing = await CompanyPolicy.findOne({ tenantId, code: req.body.code });
    if (existing) {
      return res.status(400).json({ message: 'Policy with this code already exists' });
    }

    const policy = new CompanyPolicy({
      ...req.body,
      tenantId,
      createdBy: user._id,
      updatedBy: user._id
    });

    await policy.save();
    res.status(201).json({ message: 'Policy created successfully', data: policy });
  } catch (error: any) {
    console.error('Error creating company policy:', error);
    res.status(500).json({ message: 'Error creating policy', error: error.message });
  }
};

export const getCompanyPolicies = async (req: Request, res: Response) => {
  try {
    const { tenantId } = req as any;
    const { departmentId } = req.query;

    const query: any = { tenantId };

    if (departmentId) {
      // Find policies that apply to all employees OR explicitly to this department
      query.$or = [
        { 'applicability.allEmployees': true },
        { 'applicability.departments': departmentId }
      ];
    }

    const policies = await CompanyPolicy.find(query)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('createdBy', 'firstName lastName')
      .populate('updatedBy', 'firstName lastName')
      .sort({ createdAt: -1 });
      
    res.status(200).json({ data: policies });
  } catch (error: any) {
    console.error('Error fetching company policies:', error);
    res.status(500).json({ message: 'Error fetching policies', error: error.message });
  }
};

export const getCompanyPolicyById = async (req: Request, res: Response) => {
  try {
    const { tenantId } = req as any;
    const id = req.params.id as string;
    const policy = await CompanyPolicy.findOne({ _id: id, tenantId })
      .populate('category', 'name')
      .populate('subCategory', 'name');
      
    if (!policy) {
      return res.status(404).json({ message: 'Policy not found' });
    }
    res.status(200).json({ data: policy });
  } catch (error: any) {
    console.error('Error fetching company policy:', error);
    res.status(500).json({ message: 'Error fetching policy', error: error.message });
  }
};

export const updateCompanyPolicy = async (req: Request, res: Response) => {
  try {
    const { tenantId, user } = req as any;
    const id = req.params.id as string;
    
    // Check if code changed and if it conflicts
    if (req.body.code) {
      const existing = await CompanyPolicy.findOne({ tenantId, code: req.body.code, _id: { $ne: id } });
      if (existing) {
        return res.status(400).json({ message: 'Policy with this code already exists' });
      }
    }

    const updated = await CompanyPolicy.findOneAndUpdate(
      { _id: id, tenantId },
      { ...req.body, updatedBy: user._id },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Policy not found' });
    }

    res.status(200).json({ message: 'Policy updated successfully', data: updated });
  } catch (error: any) {
    console.error('Error updating company policy:', error);
    res.status(500).json({ message: 'Error updating policy', error: error.message });
  }
};

export const deleteCompanyPolicy = async (req: Request, res: Response) => {
  try {
    const { tenantId } = req as any;
    const id = req.params.id as string;
    const deleted = await CompanyPolicy.findOneAndDelete({ _id: id, tenantId });
    
    if (!deleted) {
      return res.status(404).json({ message: 'Policy not found' });
    }

    res.status(200).json({ message: 'Policy deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting company policy:', error);
    res.status(500).json({ message: 'Error deleting policy', error: error.message });
  }
};

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import BusinessUnit from '../models/BusinessUnit';

export const createBusinessUnit = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ message: 'Unauthorized: Tenant ID missing' });
    }

    const {
      name,
      code,
      head,
      parent,
      type,
      status,
      description,
      establishedOn,
      totalEmployees,
      totalDepartments,
      primaryFocus,
      keyServices,
      annualBudget,
      costCenters,
      financialOwner,
      iconUrl
    } = req.body;

    // Check if BU code already exists for this tenant
    const existingBU = await BusinessUnit.findOne({ tenantId, code });
    if (existingBU) {
      return res.status(400).json({ message: 'Business Unit with this code already exists' });
    }

    const businessUnit = new BusinessUnit({
      tenantId,
      name,
      code,
      head: head || null,
      parent: parent || null,
      type: type || 'Operational',
      status: status || 'Active',
      description,
      establishedOn,
      totalEmployees,
      totalDepartments,
      primaryFocus,
      keyServices,
      annualBudget,
      costCenters,
      financialOwner: financialOwner || null,
      iconUrl
    });

    await businessUnit.save();

    res.status(201).json({ message: 'Business Unit created successfully', data: businessUnit });
  } catch (error: any) {
    console.error('Error creating business unit:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export const getBusinessUnits = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ message: 'Unauthorized: Tenant ID missing' });
    }

    const businessUnits = await BusinessUnit.find({ tenantId })
      .populate('head', 'firstName lastName email')
      .populate('financialOwner', 'firstName lastName email');

    res.status(200).json({ data: businessUnits });
  } catch (error: any) {
    console.error('Error fetching business units:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export const getBusinessUnitById = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ message: 'Unauthorized: Tenant ID missing' });
    }

    const businessUnit = await BusinessUnit.findById(id)
      .populate('head', 'firstName lastName email')
      .populate('financialOwner', 'firstName lastName email');

    if (!businessUnit) {
      return res.status(404).json({ message: 'Business Unit not found' });
    }

    res.status(200).json({ data: businessUnit });
  } catch (error: any) {
    console.error('Error fetching business unit:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export const updateBusinessUnit = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ message: 'Unauthorized: Tenant ID missing' });
    }

    const { code } = req.body;

    if (code) {
      const existingBU = await BusinessUnit.findOne({ tenantId, code, _id: { $ne: id } } as any);
      if (existingBU) {
        return res.status(400).json({ message: 'Business Unit with this code already exists' });
      }
    }

    const updatedBusinessUnit = await BusinessUnit.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!updatedBusinessUnit) {
      return res.status(404).json({ message: 'Business Unit not found' });
    }

    res.status(200).json({ message: 'Business Unit updated successfully', data: updatedBusinessUnit });
  } catch (error: any) {
    console.error('Error updating business unit:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export const deleteBusinessUnit = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ message: 'Unauthorized: Tenant ID missing' });
    }

    const deletedBusinessUnit = await BusinessUnit.findByIdAndDelete(id);

    if (!deletedBusinessUnit) {
      return res.status(404).json({ message: 'Business Unit not found' });
    }

    res.status(200).json({ message: 'Business Unit deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting business unit:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

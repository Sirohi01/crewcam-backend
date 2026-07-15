import { Response } from 'express';
import { Company } from '../models/Company';
import { Role, ROLE_SCOPES, ROLE_LOGIN_TYPES } from '../models/Role';
import { AuthRequest } from '../middleware/auth';

export const getMyCompanyProfile = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const company = await Company.findOne({ tenantId, isActive: true });

    if (!company) {
      return res.status(404).json({ message: 'Company profile not found' });
    }

    res.status(200).json(company);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching company profile', error: (error as any).message });
  }
};

export const updateCompanyProfile = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }

    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.tenantId;
    delete updateData.createdAt;
    delete updateData.updatedAt;
    delete updateData.__v;
    delete updateData.auditTrail;
    delete updateData.createdBy;
    delete updateData.updatedBy;
    updateData.updatedBy = req.user?._id;

    // Find and update the company
    const updatedCompany = await Company.findOneAndUpdate(
      { tenantId, isActive: true },
      { $set: updateData },
      { returnDocument: 'after' }
    );

    if (!updatedCompany) {
      return res.status(404).json({ message: 'Company profile not found' });
    }

    res.status(200).json(updatedCompany);
  } catch (error) {
    res.status(500).json({ message: 'Error updating company profile', error: (error as any).message });
  }
};

export const getCompanies = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const companies = await Company.find({ tenantId, isActive: true });
    res.status(200).json(companies);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching companies', error: (error as any).message });
  }
};

export const getCompanyRoles = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID is required' });
    const roles = await Role.find({ tenantId, isActive: true })
      .populate('createdBy', 'firstName lastName')
      .populate('updatedBy', 'firstName lastName')
      .sort({ name: 1 })
      .lean();
    res.status(200).json({ data: roles });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching roles', error: (error as any).message });
  }
};

export const createCompanyRole = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID is required' });
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const permissions = Array.isArray(req.body.permissions) ? req.body.permissions : [];
    const scope = ROLE_SCOPES.includes(req.body.scope) ? req.body.scope : 'self';
    const loginType = ROLE_LOGIN_TYPES.includes(req.body.loginType) ? req.body.loginType : 'employee';
    if (!name) return res.status(400).json({ message: 'Role name is required' });
    const duplicate = await Role.findOne({ tenantId, name, isActive: true } as any);
    if (duplicate) return res.status(400).json({ message: 'Role with this name already exists' });
    const role = new Role({
      name,
      description,
      permissions,
      scope,
      loginType,
      tenantId,
      createdBy: req.user?._id,
    });
    await role.save();
    res.status(201).json({ data: role, message: 'Role created successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error creating role', error: (error as any).message });
  }
};

export const updateCompanyRole = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID is required' });
    const { name, description, permissions, isActive } = req.body;
    const update: Record<string, any> = { name, description, permissions, isActive, updatedBy: req.user?._id };
    if (ROLE_SCOPES.includes(req.body.scope)) {
      update.scope = req.body.scope;
    }
    if (ROLE_LOGIN_TYPES.includes(req.body.loginType)) {
      update.loginType = req.body.loginType;
    }
    const role = await Role.findOneAndUpdate(
      { _id: req.params.id, tenantId } as any,
      { $set: update },
      { returnDocument: 'after', runValidators: true }
    );
    if (!role) return res.status(404).json({ message: 'Role not found' });
    res.status(200).json({ data: role, message: 'Role updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating role', error: (error as any).message });
  }
};

export const deleteCompanyRole = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID is required' });
    const role = await Role.findOneAndUpdate(
      { _id: req.params.id, tenantId } as any,
      { $set: { isActive: false, updatedBy: req.user?._id } },
      { returnDocument: 'after' }
    );
    if (!role) return res.status(404).json({ message: 'Role not found' });
    res.status(200).json({ message: 'Role deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting role', error: (error as any).message });
  }
};

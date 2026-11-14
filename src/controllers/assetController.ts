import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Asset } from '../models/Asset';
import { AssetAllocation } from '../models/AssetAllocation';
import { AuditLog } from '../models/AuditLog';
import { User } from '../models/User';
import { notifyUser } from './communicationController';

// Fields HR may set on an asset. tenantId comes from the session only.
const ASSET_FIELDS = ['name', 'type', 'serialNumber', 'purchaseDate', 'purchaseValue', 'status'] as const;
const pickAssetFields = (body: any) =>
  Object.fromEntries(ASSET_FIELDS.filter((k) => body?.[k] !== undefined && body?.[k] !== '').map((k) => [k, body[k]]));

const logAudit = async (tenantId: any, userId: any, action: string, req: AuthRequest, details: any) => {
  await AuditLog.create({
    tenantId,
    userId,
    action,
    module: 'Support',
    status: 'SUCCESS',
    ipAddress: req.ip as string,
    userAgent: req.headers['user-agent'] as string,
    details
  } as any);
};

// Asset Management
export const createAsset = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const asset = await Asset.create({ ...pickAssetFields(req.body), tenantId });
    await logAudit(tenantId, req.user!._id, 'CREATE_ASSET', req, { assetId: (asset as any)._id });

    res.status(201).json(asset);
  } catch (error: any) {
    console.error('Error creating asset:', error);
    res.status(500).json({ message: 'Error creating asset', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getAssets = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const assets = await Asset.find({ tenantId: tenantId as any }).sort({ createdAt: -1 });
    res.status(200).json(assets);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching assets', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const updateAsset = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    const asset = await Asset.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { $set: pickAssetFields(req.body) },
      { returnDocument: 'after', runValidators: true }
    );
    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    await logAudit(tenantId, req.user!._id, 'UPDATE_ASSET', req, { assetId: id });
    res.status(200).json(asset);
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating asset', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

// Asset Allocation
export const allocateAsset = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const { assetId, employeeId, condition } = req.body;

    const employee = await User.exists({ _id: employeeId, tenantId, isActive: true } as any);
    if (!employee) return res.status(400).json({ message: 'Employee not found in this company' });

    // Claim the asset first (Available -> Allocated, atomically) so two allocations can't
    // both win. The old code created the allocation, then updated the asset without a
    // tenant filter, which the tenant guard rejects — leaving the asset "Available".
    const asset = await Asset.findOneAndUpdate(
      { _id: assetId, tenantId: tenantId as any, status: 'Available' } as any,
      { $set: { status: 'Allocated' } },
      { returnDocument: 'after' }
    );
    if (!asset) return res.status(400).json({ message: 'Asset not found or not available' });

    let allocation;
    try {
      allocation = await AssetAllocation.create({ tenantId, assetId, employeeId, condition });
    } catch (err) {
      await Asset.updateOne({ _id: assetId, tenantId } as any, { $set: { status: 'Available' } });
      throw err;
    }

    await logAudit(tenantId, req.user!._id, 'ALLOCATE_ASSET', req, { allocationId: (allocation as any)._id, assetId, employeeId });
    await notifyUser(tenantId, employeeId, req.user!._id, 'Asset assigned to you',
      `${asset.name} (${asset.serialNumber}) has been assigned to you.`, '/dashboard/employee/assets');

    res.status(201).json(allocation);
  } catch (error: any) {
    res.status(500).json({ message: 'Error allocating asset', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const returnAsset = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params; // allocation id
    const { condition } = req.body;

    const allocation = await AssetAllocation.findOneAndUpdate(
      { _id: id, tenantId, status: 'Active' } as any,
      { status: 'Returned', returnDate: new Date(), condition },
      { returnDocument: 'after' }
    );
    if (!allocation) return res.status(404).json({ message: 'Active allocation not found' });

    await Asset.updateOne({ _id: allocation.assetId, tenantId } as any, { $set: { status: 'Available' } });
    await logAudit(tenantId, req.user!._id, 'RETURN_ASSET', req, { allocationId: id, assetId: allocation.assetId });

    res.status(200).json(allocation);
  } catch (error: any) {
    res.status(500).json({ message: 'Error returning asset', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getAllocations = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const { employeeId } = req.query;
    const filter: any = { tenantId: tenantId as any };
    if (employeeId) filter.employeeId = employeeId;

    const allocations = await AssetAllocation.find(filter)
      .populate('assetId')
      .populate('employeeId', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.status(200).json(allocations);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching asset allocations', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

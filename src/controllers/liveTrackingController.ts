import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { LiveTrackingConsent } from '../models/LiveTrackingConsent';
import { LiveTrackingConfig } from '../models/LiveTrackingConfig';
import { LiveTrackingLog } from '../models/LiveTrackingLog';
import { Role, resolveRoleCategory } from '../models/Role';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { getUserScopeFilter } from '../utils/scopeHelpers';

const isTrackingEnabledForRole = async (tenantId: any, roleId: any): Promise<boolean> => {
  if (!roleId) return false;
  const config = await LiveTrackingConfig.findOne({ tenantId, roleId } as any);
  return !!config?.enabled;
};

export const setConsent = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const { consentGiven } = req.body;
    const consent = await LiveTrackingConsent.findOneAndUpdate(
      { tenantId, userId: req.user._id } as any,
      {
        $set: {
          tenantId,
          userId: req.user._id,
          consentGiven: !!consentGiven,
          consentDate: consentGiven ? new Date() : undefined,
          revokedAt: !consentGiven ? new Date() : undefined,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    await AuditLog.create({
      tenantId,
      userId: req.user._id,
      action: consentGiven ? 'LIVE_TRACKING_CONSENT_GIVEN' : 'LIVE_TRACKING_CONSENT_REVOKED',
      module: 'Communication',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
    } as any);

    res.status(200).json({ message: 'Consent updated', consent });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating consent', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getMyConsent = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const consent = await LiveTrackingConsent.findOne({ tenantId, userId: req.user._id } as any);
    const enabledForMyRole = await isTrackingEnabledForRole(tenantId, req.user.roleId);
    res.status(200).json({ consent: consent || { consentGiven: false }, enabledForMyRole });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching consent', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};
export const pingLocation = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const enabled = await isTrackingEnabledForRole(tenantId, req.user.roleId);
    if (!enabled) return res.status(403).json({ message: 'Live tracking is not enabled for your role' });

    const consent = await LiveTrackingConsent.findOne({ tenantId, userId: req.user._id } as any);
    if (!consent?.consentGiven) return res.status(403).json({ message: 'Consent required before location can be tracked' });

    const { lat, lng } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ message: 'lat and lng (numbers) are required' });
    }

    const log = await LiveTrackingLog.create({ tenantId, userId: req.user._id, lat, lng, recordedAt: new Date() });
    res.status(201).json({ message: 'Location recorded', logId: log._id });
  } catch (error: any) {
    res.status(500).json({ message: 'Error recording location', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getTeamLocations = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const role: any = await Role.findOne({ _id: req.user.roleId, tenantId } as any);
    const category = resolveRoleCategory(role);
    const scopeFilter = await getUserScopeFilter(req, category);

    const consentedUserIds = (
      await LiveTrackingConsent.find({ tenantId, consentGiven: true } as any).select('userId')
    ).map((c: any) => c.userId);

    const matchFilter: any = { ...scopeFilter, userId: { $in: consentedUserIds } };

    const mongoose = require('mongoose');
    if (matchFilter.tenantId) matchFilter.tenantId = new mongoose.Types.ObjectId(matchFilter.tenantId);

    const latestByUser = await LiveTrackingLog.aggregate([
      { $match: matchFilter },
      { $sort: { recordedAt: -1 } },
      { $group: { _id: '$userId', lat: { $first: '$lat' }, lng: { $first: '$lng' }, recordedAt: { $first: '$recordedAt' } } },
    ]);

    const users = await User.find({ tenantId, _id: { $in: latestByUser.map((l) => l._id) } } as any).select('firstName lastName');
    const nameById = new Map(users.map((u: any) => [String(u._id), `${u.firstName} ${u.lastName}`]));
    const result = latestByUser.map((l) => ({ ...l, employeeName: nameById.get(String(l._id)) || 'Unknown' }));

    await AuditLog.create({
      tenantId,
      userId: req.user._id,
      action: 'LIVE_TRACKING_VIEW',
      module: 'Communication',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { viewedCount: result.length },
    } as any);

    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching team locations', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getUserHistory = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const { userId } = req.params;
    const role: any = await Role.findOne({ _id: req.user.roleId, tenantId } as any);
    const category = resolveRoleCategory(role);
    const scopeFilter = await getUserScopeFilter(req, category);
    if (scopeFilter.userId) {
      if (Array.isArray(scopeFilter.userId.$in)) {
        if (!scopeFilter.userId.$in.some((id: any) => String(id) === String(userId))) {
          return res.status(403).json({ message: 'Unauthorized' });
        }
      } else if (String(scopeFilter.userId) !== String(userId)) {
        return res.status(403).json({ message: 'Unauthorized' });
      }
    }
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const logs = await LiveTrackingLog.find({
      tenantId: tenantId as any,
      userId: userId as string,
      recordedAt: { $gte: startOfDay }
    }).sort({ recordedAt: 1 });

    res.status(200).json(logs);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching history', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

/** Company Admin: enable/disable live tracking for a specific role — never a single global switch. */
export const setRoleTrackingConfig = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const { roleId, enabled } = req.body;
    if (!roleId) return res.status(400).json({ message: 'roleId is required' });

    const config = await LiveTrackingConfig.findOneAndUpdate(
      { tenantId, roleId } as any,
      { $set: { tenantId, roleId, enabled: !!enabled } },
      { upsert: true, returnDocument: 'after' }
    );

    await AuditLog.create({
      tenantId,
      userId: req.user._id,
      action: enabled ? 'LIVE_TRACKING_ENABLED_FOR_ROLE' : 'LIVE_TRACKING_DISABLED_FOR_ROLE',
      module: 'Communication',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { roleId },
    } as any);

    res.status(200).json({ message: 'Live tracking config updated', config });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating tracking config', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getRoleTrackingConfigs = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const configs = await LiveTrackingConfig.find({ tenantId } as any).populate('roleId', 'name category');
    res.status(200).json(configs);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching tracking configs', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

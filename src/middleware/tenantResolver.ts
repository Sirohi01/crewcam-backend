import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { Tenant } from '../models/Tenant';

export const tenantResolver = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user && req.user.tenantId) {
      req.tenantId = req.user.tenantId;
      return next();
    }
    const tenantHeader = req.headers['x-tenant-id'] as string;
    if (tenantHeader) {
      req.tenantId = tenantHeader;
      return next();
    }
    const host = req.headers.host || '';
    const subdomain = host.split('.')[0];

    if (subdomain && subdomain !== 'www' && subdomain !== 'localhost') {
      const tenant = await Tenant.findOne({ subdomain, isActive: true });
      if (tenant) {
        req.tenantId = tenant._id.toString();
        return next();
      }
    }
    next();
  } catch (error) {
    console.error('Tenant resolution error:', error);
    res.status(500).json({ message: 'Internal server error during tenant resolution' });
  }
};

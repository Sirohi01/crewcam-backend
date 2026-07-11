import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { Tenant } from '../models/Tenant';
import { subdomainFromHost } from '../utils/subdomain';

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
    const subdomain = subdomainFromHost(req.headers.host);

    if (subdomain) {
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

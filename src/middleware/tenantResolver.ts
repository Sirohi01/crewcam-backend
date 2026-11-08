import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { Tenant } from '../models/Tenant';
import { subdomainFromHost } from '../utils/subdomain';

/**
 * Resolves the tenant for the request. The tenant always comes from something the
 * server trusts: the authenticated user's record, or (for unauthenticated requests)
 * the Host subdomain. The client-supplied `x-tenant-id` header is deliberately ignored —
 * honouring it would let any caller pick another company's tenant on a route that
 * mounts this middleware without `authenticate`.
 */
export const tenantResolver = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user) {
      if (!req.user.tenantId) {
        return res.status(403).json({ message: 'Access denied: user is not linked to a company' });
      }
      req.tenantId = req.user.tenantId;
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

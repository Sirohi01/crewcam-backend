import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { Tenant } from '../models/Tenant';

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

export const requireFeature = (feature: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId && !req.user?.tenantId) {
        return res.status(400).json({ message: 'Tenant context is required' });
      }

      const tenantId = req.tenantId || req.user?.tenantId;
      
      if (tenantId === 'SUPER_ADMIN') {
        return next();
      }

      const tenant = await Tenant.findById(tenantId).populate('packageId').lean();
      const pkg: any = tenant?.packageId;

      if (!pkg || !pkg.isActive) {
        return res.status(403).json({ message: 'Active subscription package is required' });
      }

      const features = (pkg.features || []).map((item: string) => normalize(item));
      const allowed = features.includes('*') || features.includes(normalize(feature));

      if (!allowed) {
        return res.status(403).json({ message: `Feature not enabled for package: ${feature}` });
      }

      next();
    } catch (error: any) {
      res.status(500).json({ message: 'Feature gate check failed', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
    }
  };
};

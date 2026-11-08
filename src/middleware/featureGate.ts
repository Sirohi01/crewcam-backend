import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { Tenant } from '../models/Tenant';
import { Company } from '../models/Company';
import { expandFeatureEntries, normalizeFeatureKey as normalize } from '../utils/featureKeys';

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

      // The v2 plan builder stores catalogue IDs; expand them to module names/codes.
      const features = (await expandFeatureEntries(pkg.features)).map(normalize);
      const packageAddons = (await expandFeatureEntries(pkg.addOnModules)).map(normalize);
      const tenantModules = (tenant?.modules || []).filter((m: any) => m.enabled).map((m: any) => normalize(m.key));
      const tenantSections = (tenant?.allowedSections || []).map((s: string) => normalize(s));
      
      const company = await Company.findOne({ tenantId }).setOptions({ bypassTenantIsolation: true }).lean();
      const companyAddons = (await expandFeatureEntries(company?.addonModules)).map(normalize);
      
      const normalizedFeature = normalize(feature);
      const aliases: Record<string, string[]> = {
        'aihiring': ['aianalytics', 'ai']
      };
      
      const featureKeysToCheck = [normalizedFeature, ...(aliases[normalizedFeature] || [])];
      
      const allowed = featureKeysToCheck.some(key => 
        features.includes('*') || 
        features.includes(key) || 
        packageAddons.includes(key) ||
        tenantModules.includes(key) ||
        tenantSections.includes(key) ||
        companyAddons.includes(key) ||
        key === 'corehr'
      );

      if (!allowed) {
        return res.status(403).json({ message: `Feature not enabled for package: ${feature}` });
      }

      next();
    } catch (error: any) {
      res.status(500).json({ message: 'Feature gate check failed', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
    }
  };
};

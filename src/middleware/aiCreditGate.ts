import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { Tenant } from '../models/Tenant';

/**
 * Per docs/02_ARCHITECTURE_AND_SECURITY_BASELINE.md rule #1: credit metering is
 * enforced server-side BEFORE the OpenAI call, not after. A 0-credit tenant gets
 * 403 here and the controller/service never runs, so no call is ever made to bill for.
 */
export const requireAiCredits = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant context is required' });
    }

    const tenant = await Tenant.findById(tenantId).select('aiCredits').lean();
    if (!tenant || (tenant.aiCredits ?? 0) <= 0) {
      return res.status(403).json({ message: 'No AI credits remaining for this tenant' });
    }

    next();
  } catch (error: any) {
    res.status(500).json({ message: 'AI credit check failed', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

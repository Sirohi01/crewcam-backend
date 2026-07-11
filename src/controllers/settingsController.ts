import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Session } from '../models/Session';
import { WhiteLabel } from '../models/WhiteLabel';
import { Integration } from '../models/Integration';
import { PlatformAiProvider } from '../models/PlatformAiProvider';
import { Tenant } from '../models/Tenant';
import { normalizeSubdomain } from '../utils/subdomain';

const ACTIVE_LIFECYCLE_STATUSES = ['ACTIVE', 'LIVE'];

// SESSIONS
export const getActiveSessions = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const userId = req.user._id as any;
    const currentToken = req.headers.authorization?.split(' ')[1];
    const sessions = await Session.find({ userId, isActive: true, expiresAt: { $gt: new Date() } }).sort({ lastActive: -1 });

    res.status(200).json(sessions);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching sessions', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const revokeSession = async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    await Session.findByIdAndUpdate(sessionId, { isActive: false });
    res.status(200).json({ message: 'Session revoked successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error revoking session', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

// WHITELABEL
// Unauthenticated: resolves branding for a subdomain so the login page can show a tenant's
// logo/colors before the user signs in. Only ever returns the explicit whitelist below —
// WhiteLabel also stores SMTP/WhatsApp credentials that must never leak pre-auth.
export const getPublicWhitelabel = async (req: Request, res: Response) => {
  try {
    const subdomain = normalizeSubdomain(req.query.subdomain as string | undefined);
    if (!subdomain) return res.status(404).json({ message: 'Not found' });

    const tenant = await Tenant.findOne({ subdomain, isActive: true }).select('lifecycleStatus').lean();
    if (!tenant || !ACTIVE_LIFECYCLE_STATUSES.includes(tenant.lifecycleStatus)) {
      return res.status(404).json({ message: 'Not found' });
    }

    const whitelabel = await WhiteLabel.findOne({ tenantId: String(tenant._id) }).lean();
    if (!whitelabel) return res.status(404).json({ message: 'Not found' });

    res.status(200).json({
      logoUrl: whitelabel.logoUrl,
      faviconUrl: whitelabel.faviconUrl,
      primaryColor: whitelabel.primaryColor,
      secondaryColor: whitelabel.secondaryColor,
      themeMode: whitelabel.themeMode,
      companyNameOverride: whitelabel.companyNameOverride,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching branding' });
  }
};

export const getWhitelabel = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const tenantId = (req.tenantId || req.user.tenantId) as any;
    let whitelabel = await WhiteLabel.findOne({ tenantId });
    if (!whitelabel) {
      whitelabel = await WhiteLabel.create({ tenantId });
    }
    res.status(200).json(whitelabel);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching whitelabel', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const updateWhitelabel = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const tenantId = (req.tenantId || req.user.tenantId) as any;
    const { primaryColor, secondaryColor, companyNameOverride, themeMode, logoUrl, faviconUrl } = req.body;

    const whitelabel = await WhiteLabel.findOneAndUpdate(
      { tenantId },
      { primaryColor, secondaryColor, companyNameOverride, themeMode, logoUrl, faviconUrl },
      { returnDocument: 'after', upsert: true }
    );
    res.status(200).json(whitelabel);
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating whitelabel', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

// INTEGRATIONS
export const getIntegrations = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const tenantId = (req.tenantId || req.user.tenantId) as any;
    const integrations = await Integration.find({ tenantId });

    // We mask the credentials before sending to the frontend
    const masked = integrations.map(i => {
      const obj = i.toObject();
      obj.credentials = i.getMaskedCredentials();
      return obj;
    });

    res.status(200).json(masked);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching integrations', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const configureIntegration = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const tenantId = (req.tenantId || req.user.tenantId) as any;
    const { provider, credentials, isActive } = req.body;

    let integration = await Integration.findOne({ tenantId, provider });
    if (integration) {
      integration.credentials = { ...integration.getDecryptedCredentials(), ...credentials } as any;
      if (isActive !== undefined) integration.isActive = isActive;
      await integration.save();
    } else {
      integration = await Integration.create({ tenantId, provider, credentials, isActive: true });
    }

    const obj = integration.toObject();
    obj.credentials = integration.getMaskedCredentials();

    res.status(200).json({ message: 'Integration updated successfully', integration: obj });
  } catch (error: any) {
    res.status(500).json({ message: 'Error configuring integration', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};
export const getTenantAiProviderOptions = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const tenantId = (req.tenantId || req.user.tenantId) as any;

    const [activeProviders, tenant] = await Promise.all([
      PlatformAiProvider.find({ tenantId, isActive: true }).select('provider'),
      Tenant.findById(tenantId).select('preferredAiProvider'),
    ]);

    res.status(200).json({
      available: activeProviders.map((p) => p.provider),
      preferred: tenant?.preferredAiProvider || null,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching AI provider options', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const setTenantAiProvider = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const tenantId = (req.tenantId || req.user.tenantId) as any;
    const { provider } = req.body;

    const isActive = await PlatformAiProvider.exists({ tenantId, provider, isActive: true });
    if (!isActive) return res.status(400).json({ message: 'That AI provider is not active for your company — contact your administrator' });

    await Tenant.updateOne({ _id: tenantId }, { preferredAiProvider: provider });
    res.status(200).json({ message: 'AI provider preference updated', preferred: provider });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating AI provider preference', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

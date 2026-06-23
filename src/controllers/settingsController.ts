import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Session } from '../models/Session';
import { WhiteLabel } from '../models/WhiteLabel';
import { Integration } from '../models/Integration';

// SESSIONS
export const getActiveSessions = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const userId = req.user._id as any;
    const currentToken = req.headers.authorization?.split(' ')[1];
    
    // Using a simplistic approach: we'll fetch all refresh tokens for this user.
    // In a real scenario, you decode the currentToken to mark "current device".
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
    const { primaryColor, companyNameOverride, themeMode } = req.body;
    
    const whitelabel = await WhiteLabel.findOneAndUpdate(
      { tenantId },
      { primaryColor, companyNameOverride, themeMode },
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

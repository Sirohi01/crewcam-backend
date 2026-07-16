import { Response } from 'express';
import { Session } from '../models/Session';
import { AuthRequest } from '../middleware/auth';
import { hashToken } from '../utils/authTokens';
import { AuthToken } from '../models/AuthToken';

export const getSessions = async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await Session.find({ userId: req.user!._id, tenantId: req.tenantId || req.user!.tenantId, isActive: true } as any).select('-refreshToken');
    res.status(200).json(sessions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching sessions' });
  }
};

export const revokeSession = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!id) return res.status(400).json({ message: 'Session ID is required' });
    const session = await Session.findOne({ _id: id, userId: req.user!._id, tenantId: req.tenantId || req.user!.tenantId } as any);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    
    session.isActive = false;
    await session.save();

    await AuthToken.findOneAndUpdate(
      { tokenHash: hashToken(session.refreshToken), type: 'refresh' },
      { revokedAt: new Date() }
    );

    res.status(200).json({ message: 'Session revoked successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error revoking session' });
  }
};

export const revokeAllOtherSessions = async (req: AuthRequest, res: Response) => {
  try {
    const currentRefreshToken = req.cookies.refreshToken_employer || req.cookies.refreshToken_super_admin;
    const sessions = await Session.find({ userId: req.user!._id, tenantId: req.tenantId || req.user!.tenantId, isActive: true } as any);
    
    for (const session of sessions) {
      if (session.refreshToken !== currentRefreshToken) {
        session.isActive = false;
        await session.save();
        await AuthToken.findOneAndUpdate(
          { tokenHash: hashToken(session.refreshToken), type: 'refresh' },
          { revokedAt: new Date() }
        );
      }
    }
    res.status(200).json({ message: 'All other sessions revoked successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error revoking sessions' });
  }
};

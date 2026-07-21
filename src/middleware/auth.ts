import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User';
import { getJwtSecret } from '../utils/authTokens';

export interface AuthRequest extends Request {
  user?: IUser;
  tenantId?: string;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Employer and super-admin portals now use differently-named cookies (see
    // sessionCookieNames in authController.ts) so logging out of one can't touch the
    // other — this just tries both, since the JWT itself is self-contained regardless
    // of which portal's cookie slot it came from.
    const token = req.cookies.token_employer || req.cookies.token_super_admin || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, getJwtSecret()) as any;
    const user = await User.findById(decoded.id).setOptions({ bypassTenantIsolation: true });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or inactive' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

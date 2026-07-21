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
    const tokensToTry = [
      req.cookies.token_super_admin,
      req.cookies.token_employer,
      req.headers.authorization?.split(' ')[1]
    ].filter(Boolean);

    if (tokensToTry.length === 0) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    let validUser = null;
    let lastError = null;

    for (const token of tokensToTry) {
      try {
        const decoded = jwt.verify(token, getJwtSecret()) as any;
        const user = await User.findById(decoded.id).setOptions({ bypassTenantIsolation: true });
        
        if (user && user.isActive) {
          validUser = user;
          break; // Found a valid token!
        }
      } catch (err) {
        lastError = err;
        // Continue to next token if this one failed
      }
    }

    if (!validUser) {
      return res.status(401).json({ message: 'User not found, inactive, or token expired' });
    }

    req.user = validUser;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Authentication failed' });
  }
};

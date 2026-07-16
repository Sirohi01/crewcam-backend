import { Request, Response } from 'express';
import crypto from 'crypto';
import { User } from '../models/User';
import bcrypt from 'bcrypt';
import { AuthToken } from '../models/AuthToken';
import { createOpaqueToken, hashToken, signAccessToken } from '../utils/authTokens';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { z } from 'zod';
import { AuditLog } from '../models/AuditLog';
import { Session } from '../models/Session';
import { Tenant } from '../models/Tenant';
import { Company } from '../models/Company';
import { Role, resolveRoleLoginType } from '../models/Role';
import { buildPasswordResetEmail, sendMail } from '../services/mailer';
import { notificationService } from '../services/notificationService';
import { normalizeSubdomain } from '../utils/subdomain';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const generateOtp = () => crypto.randomInt(100000, 1000000).toString();
// Mixes the userId into the hash so two users independently issued the same 6-digit code
// don't collide on AuthToken's unique tokenHash index.
const hashOtp = (userId: unknown, otp: string) => hashToken(`${userId}:${otp}`);

const LIFECYCLE_BLOCK_MESSAGES: Record<string, string> = {
  SUSPENDED: 'Your company account has been suspended. Please contact CrewCam support.',
  EXPIRED: 'Your company subscription has expired. Please contact CrewCam support to renew.',
  CLOSED: 'This company account has been closed.',
};

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const refreshExpiry = () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
const resetExpiry = () => new Date(Date.now() + 1000 * 60 * 30);

// crewcam-frontend (employer/employee portal) and crewcam-superadmin both talk to this same
// backend origin in local dev (and could share a parent domain in prod) — giving each portal
// its own cookie names means logging out of one can never touch the other's session, instead
// of both fighting over one shared 'token'/'refreshToken' pair.
const sessionCookieNames = (portal: unknown) => {
  const suffix = portal === 'super-admin' ? 'super_admin' : 'employer';
  return { token: `token_${suffix}`, refreshToken: `refreshToken_${suffix}` };
};

// Shared by login, login2FA and googleLogin: issues the refresh token, session record,
// and httpOnly cookies, and returns the trimmed user object each login response sends back.
const issueSession = async (user: any, req: Request, res: Response, portal: unknown) => {
  const token = signAccessToken(user);
  const refreshToken = createOpaqueToken();
  await AuthToken.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    type: 'refresh',
    expiresAt: refreshExpiry(),
  });

  await Session.create({
    userId: user._id,
    tenantId: user.tenantId,
    refreshToken: refreshToken,
    browser: req.headers['user-agent'] || '',
    ipAddress: req.ip || '',
    expiresAt: refreshExpiry(),
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const cookieNames = sessionCookieNames(portal);
  res.cookie(cookieNames.token, token, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });
  res.cookie(cookieNames.refreshToken, refreshToken, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });

  return {
    id: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profilePictureUrl: user.profilePictureUrl,
    tenantId: user.tenantId,
  };
};

// A company cannot log in until provisioning and activation are complete. Tenants created
// before this field existed have no lifecycleStatus set — treated as grandfathered-active
// rather than retroactively locked out. Platform/super-admin users carry the 'SUPER_ADMIN'
// sentinel instead of a real Tenant id, so they're skipped entirely.
const getLifecycleBlock = async (tenantId?: string): Promise<{ message: string; lifecycleStatus: string } | null> => {
  if (!tenantId || tenantId === 'SUPER_ADMIN') return null;
  const tenant = await Tenant.findById(tenantId).select('lifecycleStatus').lean();
  const status = tenant?.lifecycleStatus;
  if (status && status !== 'ACTIVE' && status !== 'LIVE') {
    return {
      message: LIFECYCLE_BLOCK_MESSAGES[status] || 'Your company workspace is still being set up. Please contact CrewCam support.',
      lifecycleStatus: status,
    };
  }
  return null;
};

// Subdomain is a branding hint, not the tenant isolation boundary (that's still the JWT's
// tenantId) — but if the client resolved a *known* tenant from the subdomain and it doesn't
// match the authenticating user's own tenant, this is almost certainly the wrong workspace.
// Unrecognized/absent subdomains (e.g. the default app.crewcam.com) always pass through.
const isSubdomainMismatch = async (subdomainRaw: unknown, user: any): Promise<boolean> => {
  const subdomain = normalizeSubdomain(typeof subdomainRaw === 'string' ? subdomainRaw : undefined);
  if (!subdomain) return false;
  const tenant = await Tenant.findOne({ subdomain }).select('_id').lean();
  if (!tenant) return false;
  return String(tenant._id) !== String(user.tenantId);
};

// Employer Login asks for a Corporate ID as an extra factor beyond the subdomain. Only
// enforced when the caller actually sends one (i.e. from the Employer Login screen) — the
// Employee Login screen never sends this, so it's a no-op there. A tenant that hasn't set a
// corporateId in Company Profile yet simply can't be matched, which is intentional: the field
// must be configured before Employer Login will accept it.
const isCorporateIdMismatch = async (corporateIdRaw: unknown, user: any): Promise<boolean> => {
  if (typeof corporateIdRaw !== 'string' || !corporateIdRaw.trim()) return false;
  const company = await Company.findOne({ tenantId: user.tenantId, isActive: true }).select('corporateId').lean();
  return (company?.corporateId || '').trim().toLowerCase() !== corporateIdRaw.trim().toLowerCase();
};

// Employee Login and Employer Login are two distinct screens for the same tenant-side app
// (both send portal: 'employer') — Role.loginType is what actually separates them, set
// explicitly when the role is created (Owner/CEO/Director/... = employer; HR Recruiter/
// Team Leader/Employee/... = employee). A user with no role assigned yet defaults to
// 'employee' via resolveRoleLoginType, so they're blocked from Employer Login until an
// admin assigns them an employer-side role.
const isLoginTypeMismatch = async (loginTypeRaw: unknown, user: any): Promise<boolean> => {
  if (loginTypeRaw !== 'employee' && loginTypeRaw !== 'employer') return false;
  const role = user.roleId
    ? await Role.findById(user.roleId).setOptions({ bypassTenantIsolation: true }).select('loginType permissions').lean()
    : null;
  return resolveRoleLoginType(role as any) !== loginTypeRaw;
};

// Employer and super-admin portals are separate front-end apps hitting the same endpoint;
// this keeps a tenant user out of the platform-admin login and vice versa.
const isPortalMismatch = (portal: unknown, user: any): boolean => {
  if (portal !== 'super-admin' && portal !== 'employer') return false;
  const isSuperAdmin = user.tenantId === 'SUPER_ADMIN';
  return (portal === 'super-admin' && !isSuperAdmin) || (portal === 'employer' && isSuperAdmin);
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).setOptions({ bypassTenantIsolation: true });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      return res.status(403).json({ message: 'Account is locked. Please try again later.' });
    }
    
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await user.save();

      await AuditLog.create({
        tenantId: user.tenantId,
        userId: user._id,
        action: 'LOGIN',
        module: 'Auth',
        status: 'FAILURE',
        ipAddress: req.ip || '',
        userAgent: req.headers['user-agent'] || '',
        details: { reason: 'Invalid password' }
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    user.failedLoginAttempts = 0;
    user.lockoutUntil = undefined as any;
    await user.save();

    if (!user.isActive) {
      return res.status(401).json({ message: 'User account is inactive' });
    }

    if (isPortalMismatch(req.body.portal, user)) {
      return res.status(403).json({ message: 'Invalid credentials' });
    }

    if (await isSubdomainMismatch(req.body.subdomain, user)) {
      return res.status(403).json({ message: "This account doesn't belong to this workspace." });
    }

    const lifecycleBlock = await getLifecycleBlock(user.tenantId);
    if (lifecycleBlock) {
      await AuditLog.create({
        tenantId: user.tenantId,
        userId: user._id,
        action: 'LOGIN',
        module: 'Auth',
        status: 'FAILURE',
        ipAddress: req.ip || '',
        userAgent: req.headers['user-agent'] || '',
        details: { reason: 'Lifecycle status blocked login', lifecycleStatus: lifecycleBlock.lifecycleStatus },
      });
      return res.status(403).json(lifecycleBlock);
    }

    if (user.twoFactorEnabled) {
      return res.status(200).json({
        message: '2FA required',
        requires2FA: true,
        email: user.email
      });
    }

    const userResponse = await issueSession(user, req, res, req.body.portal);

    await AuditLog.create({
      tenantId: user.tenantId,
      userId: user._id,
      action: 'LOGIN',
      module: 'Auth',
      status: 'SUCCESS',
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.status(200).json({ message: 'Login successful', user: userResponse });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const login2FA = async (req: Request, res: Response) => {
  try {
    const { email, password, token: totpToken } = req.body;
    const user = await User.findOne({ email }).setOptions({ bypassTenantIsolation: true });
    
    if (!user || !user.isActive || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(401).json({ message: 'Invalid 2FA request' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: totpToken,
      window: 1 // Allow 30 seconds clock drift
    });

    if (!verified) {
      return res.status(401).json({ message: 'Invalid 2FA token' });
    }

    if (isPortalMismatch(req.body.portal, user)) {
      return res.status(403).json({ message: 'Invalid credentials' });
    }

    if (await isSubdomainMismatch(req.body.subdomain, user)) {
      return res.status(403).json({ message: "This account doesn't belong to this workspace." });
    }

    const userResponse = await issueSession(user, req, res, req.body.portal);
    res.status(200).json({ message: 'Login successful', user: userResponse });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Looks up by employee code first (what employees actually have memorized) and falls back
// to email, since the login form accepts either in a single "User ID" field.
const findUserByIdentifier = (identifier: string) => {
  const trimmed = identifier.trim();
  return User.findOne({
    $or: [{ employeeCode: trimmed }, { email: trimmed.toLowerCase() }],
  }).setOptions({ bypassTenantIsolation: true });
};

export const sendLoginOtp = async (req: Request, res: Response) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ message: 'User ID is required' });

    // Generic response regardless of what's found, to avoid leaking which identifiers exist.
    const genericResponse = { message: 'If the account exists, an OTP has been sent to the registered mobile number.' };

    const user = await findUserByIdentifier(identifier);
    if (!user || !user.isActive || !user.mobileNumber) {
      return res.status(200).json(genericResponse);
    }

    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      return res.status(403).json({ message: 'Account is locked. Please try again later.' });
    }

    if (isPortalMismatch(req.body.portal, user)) return res.status(200).json(genericResponse);
    if (await isSubdomainMismatch(req.body.subdomain, user)) return res.status(200).json(genericResponse);
    if (await isCorporateIdMismatch(req.body.corporateId, user)) return res.status(200).json(genericResponse);
    if (await isLoginTypeMismatch(req.body.loginType, user)) {
      return res.status(403).json(
        req.body.loginType === 'employer'
          ? { message: 'This account is not a Company Admin. Please use Employee Login instead.', redirectTo: '/login' }
          : { message: 'This account is a Company Admin. Please use Employer Login instead.', redirectTo: '/employer-login' }
      );
    }

    const lifecycleBlock = await getLifecycleBlock(user.tenantId);
    if (lifecycleBlock) return res.status(403).json(lifecycleBlock);

    const recentOtp = await AuthToken.findOne({
      userId: user._id,
      type: 'login_otp',
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date(Date.now() + OTP_TTL_MS - OTP_RESEND_COOLDOWN_MS) },
    });
    if (recentOtp) return res.status(429).json({ message: 'Please wait before requesting another OTP.' });

    const otp = generateOtp();
    await AuthToken.create({
      userId: user._id,
      tokenHash: hashOtp(user._id, otp),
      type: 'login_otp',
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    await notificationService.sendSMS(
      String(user.tenantId),
      user.mobileNumber,
      `Your CrewCam HRMS login OTP is ${otp}. It expires in 5 minutes.`
    );

    // No SMS provider is wired up yet, so outside production the OTP is echoed back
    // in the response for testing instead of being delivered anywhere.
    res.status(200).json({
      ...genericResponse,
      otp: process.env.NODE_ENV === 'production' ? undefined : otp,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error sending OTP' });
  }
};

export const verifyLoginOtp = async (req: Request, res: Response) => {
  try {
    const { identifier, otp } = req.body;
    if (!identifier || !otp) return res.status(400).json({ message: 'User ID and OTP are required' });

    const user = await findUserByIdentifier(identifier);
    if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid or expired OTP' });

    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      return res.status(403).json({ message: 'Account is locked. Please try again later.' });
    }

    const tokenDoc = await AuthToken.findOne({
      userId: user._id,
      tokenHash: hashOtp(user._id, otp),
      type: 'login_otp',
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });

    if (!tokenDoc) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await user.save();
      return res.status(401).json({ message: 'Invalid or expired OTP' });
    }

    tokenDoc.revokedAt = new Date();
    await tokenDoc.save();

    if (isPortalMismatch(req.body.portal, user)) {
      return res.status(403).json({ message: 'Invalid credentials' });
    }
    if (await isSubdomainMismatch(req.body.subdomain, user)) {
      return res.status(403).json({ message: "This account doesn't belong to this workspace." });
    }
    if (await isCorporateIdMismatch(req.body.corporateId, user)) {
      return res.status(403).json({ message: 'Invalid Corporate ID.' });
    }
    if (await isLoginTypeMismatch(req.body.loginType, user)) {
      return res.status(403).json(
        req.body.loginType === 'employer'
          ? { message: 'This account is not a Company Admin. Please use Employee Login instead.', redirectTo: '/login' }
          : { message: 'This account is a Company Admin. Please use Employer Login instead.', redirectTo: '/employer-login' }
      );
    }

    const lifecycleBlock = await getLifecycleBlock(user.tenantId);
    if (lifecycleBlock) return res.status(403).json(lifecycleBlock);

    user.failedLoginAttempts = 0;
    user.lockoutUntil = undefined as any;
    await user.save();

    const userResponse = await issueSession(user, req, res, req.body.portal);

    await AuditLog.create({
      tenantId: user.tenantId,
      userId: user._id,
      action: 'LOGIN',
      module: 'Auth',
      status: 'SUCCESS',
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: { method: 'OTP' },
    });

    res.status(200).json({ message: 'Login successful', user: userResponse });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const register = async (req: Request, res: Response) => {
  return res.status(403).json({ message: 'Public registration is disabled. Please contact your administrator to create an account.' });
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const cookieNames = sessionCookieNames(req.body.portal);
    const rawToken = req.cookies[cookieNames.refreshToken] || req.body.refreshToken;
    if (!rawToken) return res.status(400).json({ message: 'Refresh token is required' });

    const tokenDoc = await AuthToken.findOne({
      tokenHash: hashToken(rawToken),
      type: 'refresh',
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });

    if (!tokenDoc) return res.status(401).json({ message: 'Invalid or expired refresh token' });

    // bypassTenantIsolation: userId comes from a verified opaque refresh-token hash, not request input.
    const user = await User.findById(tokenDoc.userId).setOptions({ bypassTenantIsolation: true });
    if (!user || !user.isActive) return res.status(401).json({ message: 'User not found or inactive' });

    const nextRefreshToken = createOpaqueToken();
    tokenDoc.revokedAt = new Date();
    await tokenDoc.save();
    await AuthToken.create({
      userId: user._id,
      tokenHash: hashToken(nextRefreshToken),
      type: 'refresh',
      expiresAt: refreshExpiry(),
    });

    await Session.findOneAndUpdate(
      { refreshToken: rawToken, tenantId: user.tenantId } as any,
      { refreshToken: nextRefreshToken, expiresAt: refreshExpiry(), lastActive: new Date() }
    );

    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie(cookieNames.token, signAccessToken(user), { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });
    res.cookie(cookieNames.refreshToken, nextRefreshToken, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });

    res.status(200).json({ message: 'Token refreshed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error refreshing token' });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const cookieNames = sessionCookieNames(req.body.portal);
    const rawToken = req.cookies[cookieNames.refreshToken] || req.body.refreshToken;
    if (rawToken) {
      await AuthToken.findOneAndUpdate(
        { tokenHash: hashToken(rawToken), type: 'refresh' },
        { revokedAt: new Date() }
      );
    }
    res.clearCookie(cookieNames.token, { path: '/' });
    res.clearCookie(cookieNames.refreshToken, { path: '/' });
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error logging out' });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email }).setOptions({ bypassTenantIsolation: true });
    if (!user) {
      return res.status(200).json({ message: 'If the email exists, a reset token has been generated' });
    }

    const resetToken = createOpaqueToken();
    await AuthToken.create({
      userId: user._id,
      tokenHash: hashToken(resetToken),
      type: 'password_reset',
      expiresAt: resetExpiry(),
    });

    const resetBaseUrl = process.env.FRONTEND_LOGIN_URL?.replace('/login', '/reset-password') || 'http://localhost:3000/reset-password';
    const { subject, html } = buildPasswordResetEmail({
      firstName: user.firstName,
      resetUrl: `${resetBaseUrl}?token=${resetToken}`,
    });
    await sendMail({ to: user.email, subject, html });

    res.status(200).json({
      message: 'If the email exists, a reset link has been sent',
      resetToken: process.env.NODE_ENV === 'production' ? undefined : resetToken,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating reset token' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: 'Token and password are required' });
    try {
      passwordSchema.parse(password);
    } catch (zodError: any) {
      return res.status(400).json({ message: zodError.errors[0].message });
    }

    const tokenDoc = await AuthToken.findOne({
      tokenHash: hashToken(token),
      type: 'password_reset',
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    if (!tokenDoc) return res.status(400).json({ message: 'Invalid or expired reset token' });

    const salt = await bcrypt.genSalt(10);
    // bypassTenantIsolation: userId comes from a verified opaque reset-token hash, not request input.
    await User.findByIdAndUpdate(tokenDoc.userId, { passwordHash: await bcrypt.hash(password, salt) }, { bypassTenantIsolation: true } as any);
    tokenDoc.revokedAt = new Date();
    await tokenDoc.save();

    const userForAudit = await User.findById(tokenDoc.userId).setOptions({ bypassTenantIsolation: true }).lean();

    await AuditLog.create({
      tenantId: userForAudit?.tenantId || 'system',
      userId: tokenDoc.userId,
      action: 'PASSWORD_RESET',
      module: 'Auth',
      status: 'SUCCESS',
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error resetting password' });
  }
};

export const setup2FA = async (req: any, res: Response) => {
  try {
    const user = await User.findOne({ _id: req.user._id, tenantId: req.user.tenantId } as any);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.twoFactorEnabled) {
      return res.status(400).json({ message: '2FA is already enabled' });
    }

    const secret = speakeasy.generateSecret({
      name: `CREWCAM (${user.email})`
    });

    user.twoFactorSecret = secret.base32;
    await user.save();

    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url || '');

    res.status(200).json({
      secret: secret.base32,
      qrCodeUrl,
      message: 'Scan this QR code with your authenticator app'
    });
  } catch (error) {
    res.status(500).json({ message: 'Error setting up 2FA' });
  }
};

export const verifyAndEnable2FA = async (req: any, res: Response) => {
  try {
    const { token } = req.body;
    const user = await User.findOne({ _id: req.user._id, tenantId: req.user.tenantId } as any);
    
    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ message: '2FA setup not initialized' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1
    });

    if (verified) {
      user.twoFactorEnabled = true;
      await user.save();
      return res.status(200).json({ message: '2FA enabled successfully' });
    } else {
      return res.status(400).json({ message: 'Invalid token' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error verifying 2FA' });
  }
};

export const disable2FA = async (req: any, res: Response) => {
  try {
    const { token } = req.body;
    const user = await User.findOne({ _id: req.user._id, tenantId: req.user.tenantId } as any);
    
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ message: '2FA is not enabled' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1
    });

    if (verified) {
      user.twoFactorEnabled = false;
      user.twoFactorSecret = '';
      await user.save();
      return res.status(200).json({ message: '2FA disabled successfully' });
    } else {
      return res.status(400).json({ message: 'Invalid token' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error disabling 2FA' });
  }
};

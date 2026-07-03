import { Response } from 'express';
import { Tenant } from '../models/Tenant';
import { AuthRequest } from '../middleware/auth';
import { Package } from '../models/Package';
import { Permission } from '../models/Permission';
import { FeatureFlag } from '../models/FeatureFlag';
import { Company } from '../models/Company';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { AiUsageLog } from '../models/AiUsageLog';
import { AuditLog } from '../models/AuditLog';
import { Payment } from '../models/Payment';
<<<<<<< Updated upstream
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { buildCredentialsResetEmail, sendMail } from '../services/mailer';

function getLoginUrl(): string {
  return process.env.FRONTEND_LOGIN_URL || 'https://app.crewcam.com/login';
}
=======
import { Ticket } from '../models/Ticket';
import { CompanyLifecycleEvent } from '../models/CompanyLifecycleEvent';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { buildCompanyWelcomeEmail, buildCredentialsResetEmail, sendMail } from '../services/mailer';
>>>>>>> Stashed changes

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const createTenantSchema = z.object({
  name: z.string().trim().min(2, 'Company name must be at least 2 characters'),
  packageId: z.string().min(1, 'A subscription package must be selected'),
  aiCredits: z.coerce.number().min(0).optional().default(0),
  adminFirstName: z.string().trim().min(1, 'Admin first name is required'),
  adminLastName: z.string().trim().min(1, 'Admin last name is required'),
  adminEmail: z.string().trim().email('A valid admin email is required'),
  adminPassword: passwordSchema,
  country: z.string().trim().min(1).default('India'),
  tradeName: z.string().optional(),
  industry: z.string().optional(),
  companyType: z.string().optional(),
  website: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  timezone: z.string().optional(),
  baseCurrency: z.string().optional(),
  financialYearStartMonth: z.coerce.number().optional(),
  panNumber: z.string().optional(),
  gstin: z.string().optional(),
  cin: z.string().optional(),
  tan: z.string().optional(),
  epfoNumber: z.string().optional(),
  esicNumber: z.string().optional(),
  ptNumber: z.string().optional(),
  lwfNumber: z.string().optional(),
  tin: z.string().optional(),
  ein: z.string().optional(),
  vatNumber: z.string().optional(),
  businessLicenseNumber: z.string().optional(),
  logoUrl: z.string().optional(),
  adminProfilePictureUrl: z.string().optional(),
  setupFeeAmount: z.coerce.number().min(0).optional().default(0),
  setupFeeCurrency: z.enum(['INR', 'USD']).optional().default('INR'),
  setupFeeStatus: z.enum(['PENDING', 'PAID', 'WAIVED']).optional().default('PENDING'),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional().default('MONTHLY'),
  subscriptionAmount: z.coerce.number().min(0).optional().default(0),
  subscriptionCurrency: z.enum(['INR', 'USD']).optional().default('INR'),
});

const updateTenantSchema = createTenantSchema.partial({
  adminPassword: true,
  packageId: true,
}).extend({
  isActive: z.coerce.boolean().optional(),
  setupFeeStatus: z.enum(['PENDING', 'PAID', 'WAIVED']).optional(),
  subscriptionStatus: z.enum(['ACTIVE', 'PENDING', 'PAST_DUE', 'CANCELLED']).optional(),
});

function computeNextRenewalDate(from: Date, billingCycle: 'MONTHLY' | 'YEARLY'): Date {
  const next = new Date(from);
  if (billingCycle === 'YEARLY') next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

function getLoginUrl(): string {
  return process.env.FRONTEND_LOGIN_URL || 'https://app.crewcam.com/login';
}

function toINR(amount: number, currency: 'INR' | 'USD'): number {
  if (currency === 'USD') {
    const rate = parseFloat(process.env.USD_TO_INR_RATE || '83.5');
    return amount * rate;
  }
  return amount;
}

function resolveDateRange(range: string | undefined, fromQuery: string | undefined, toQuery: string | undefined): { start: Date; end: Date } {
  const now = new Date();
  if (range === 'week') {
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }
  if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    return { start, end };
  }
  if (range === 'custom' && fromQuery && toQuery) {
    const start = new Date(fromQuery);
    start.setHours(0, 0, 0, 0);
    const end = new Date(toQuery);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  // default: today
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

async function writeAuditLog(params: { tenantId: string; userId?: any; action: string; status: 'SUCCESS' | 'FAILURE'; details?: Record<string, any> }) {
  try {
    await AuditLog.create({
      tenantId: params.tenantId,
      userId: params.userId,
      action: params.action,
      module: 'SuperAdmin',
      status: params.status,
      details: params.details,
    } as any);
  } catch (err) {
    console.error('[audit] failed to write audit log:', err);
  }
}

export const getAllTenants = async (req: AuthRequest, res: Response) => {
  try {
    const tenants = await Tenant.find().populate('packageId').lean();
    const tenantsWithAdmin = await Promise.all(tenants.map(async (tenant) => {
      const adminRole = await Role.findOne({ tenantId: tenant._id.toString(), name: 'Company Admin' }).lean();
      let admin = null;
      if (adminRole) {
        admin = await User.findOne({ tenantId: tenant._id.toString(), roleId: adminRole._id }).select('firstName lastName email profilePictureUrl').lean();
      }
      const company = await Company.findOne({ tenantId: tenant._id.toString() }).lean();
      return {
        ...tenant,
        admin,
        company
      };
    }));

    res.status(200).json(tenantsWithAdmin);
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({ message: 'Internal server error while fetching tenants' });
  }
};

export const createTenant = async (req: AuthRequest, res: Response) => {
  let createdTenantId: any = null;
  try {
    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input', errors: parsed.error.issues });
    }
    const {
      name, packageId, aiCredits, adminFirstName, adminLastName, adminEmail, adminPassword, country,
      tradeName, industry, companyType, website, email, phone,
      addressLine1, addressLine2, city, state, postalCode,
      timezone, baseCurrency, financialYearStartMonth,
      panNumber, gstin, cin, tan, epfoNumber, esicNumber, ptNumber, lwfNumber,
      tin, ein, vatNumber, businessLicenseNumber,
      logoUrl, adminProfilePictureUrl,
      setupFeeAmount, setupFeeCurrency, setupFeeStatus,
      billingCycle, subscriptionAmount, subscriptionCurrency,
    } = parsed.data;

    const existingUser = await User.findOne({ email: adminEmail }).setOptions({ bypassTenantIsolation: true });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this admin email already exists' });
    }

    const pkg = await Package.findById(packageId);
    if (!pkg || !pkg.isActive) {
      return res.status(400).json({ message: 'Selected package does not exist or is inactive' });
    }

    const subscriptionStartDate = new Date();
    const nextRenewalDate = computeNextRenewalDate(subscriptionStartDate, billingCycle);

    const tenant = new Tenant({
      name,
      packageId,
      aiCredits: Math.max(0, Number(aiCredits) || 0),
      setupFeeAmount,
      setupFeeCurrency,
      setupFeeStatus,
      setupFeePaidAt: setupFeeStatus === 'PAID' ? new Date() : undefined,
      billingCycle,
      subscriptionAmount,
      subscriptionCurrency,
      subscriptionStatus: 'ACTIVE',
      subscriptionStartDate,
      nextRenewalDate,
      createdBy: req.user?._id,
    });
    await tenant.save();
    createdTenantId = tenant._id;

    if (setupFeeStatus === 'PAID' && setupFeeAmount > 0) {
      await Payment.create({
        tenantId: tenant._id,
        type: 'SETUP_FEE',
        amount: setupFeeAmount,
        currency: setupFeeCurrency,
        paidAt: new Date(),
        ...(req.user?._id && { recordedBy: req.user._id }),
      });
    }

    // Create Company (Root)
    const company = new Company({
      legalName: name,
      tradeName, industry, companyType, website,
      email: email || adminEmail,
      phone,
      addressLine1, addressLine2, city, state, postalCode, country: country || 'India',
      timezone, baseCurrency, financialYearStartMonth,
      panNumber, gstin, cin, tan, epfoNumber, esicNumber, ptNumber, lwfNumber,
      tin, ein, vatNumber, businessLicenseNumber,
      logoUrl,
      tenantId: tenant._id,
      createdBy: req.user?._id
    });
    await company.save();

    // Create Company Admin Role
    const adminRole = new Role({
      name: 'Company Admin',
      description: 'Full access to company operations',
      permissions: ['*'], // Wildcard for all permissions
      category: 'company_admin', // sees every sidebar item — docs/03_ROLES_DASHBOARDS_PERMISSIONS.md
      tenantId: tenant._id,
      createdBy: req.user?._id
    });
    await adminRole.save();

    // Create Admin User
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(adminPassword, salt);

    const adminUser = new User({
      firstName: adminFirstName,
      lastName: adminLastName,
      email: adminEmail,
      passwordHash,
      profilePictureUrl: adminProfilePictureUrl,
      roleId: adminRole._id,
      tenantId: tenant._id,
      createdBy: req.user?._id
    });
    await adminUser.save();

    const { subject, html } = buildCompanyWelcomeEmail({
      companyName: name,
      adminFirstName,
      adminEmail,
      adminPassword,
      loginUrl: getLoginUrl(),
    });
    const emailResult = await sendMail({ to: adminEmail, subject, html });

    tenant.credentialsEmailStatus = emailResult.sent ? 'SENT' : 'FAILED';
    if (emailResult.sent) tenant.credentialsEmailSentAt = new Date();
    if (!emailResult.sent && emailResult.error) tenant.credentialsEmailError = emailResult.error;
    await tenant.save();

    await writeAuditLog({
      tenantId: String(tenant._id),
      userId: req.user?._id,
      action: 'CREATE_COMPANY',
      status: 'SUCCESS',
      details: { name, adminEmail, packageId, credentialsEmailSent: emailResult.sent },
    });

    // Quick-create already performs implementation/provisioning/configuration/QA/credential-issuing
    // in one atomic step, so the lifecycle starts at ACTIVATION_PENDING rather than replaying every
    // earlier stage. Login stays blocked until this is explicitly advanced to ACTIVE.
    await CompanyLifecycleEvent.create({
      tenantId: tenant._id,
      toStatus: tenant.lifecycleStatus,
      note: 'Company provisioned via quick-create — implementation through credential issuance completed in one step.',
      ...(req.user?._id && { changedBy: req.user._id }),
    });

    const responsePayload = tenant.toObject();
    res.status(201).json({
      ...responsePayload,
      credentialsEmailSent: emailResult.sent,
      credentialsEmailError: emailResult.error,
      adminEmail,
      // Only returned once, in the create response, as a fallback if the email failed to send.
      adminPasswordFallback: emailResult.sent ? undefined : adminPassword,
    });
  } catch (error) {
    console.error('Error creating tenant:', error);
    if (createdTenantId) {
      // Roll back partially-created records so a failed setup doesn't leave an orphaned company.
      await Promise.all([
        Tenant.findByIdAndDelete(createdTenantId),
        Company.deleteMany({ tenantId: createdTenantId }),
        Role.deleteMany({ tenantId: createdTenantId }),
        User.deleteMany({ tenantId: createdTenantId }),
        Payment.deleteMany({ tenantId: createdTenantId }),
      ]).catch((rollbackErr) => console.error('Rollback failed:', rollbackErr));
    }
    res.status(500).json({ message: 'Internal server error while creating tenant' });
  }
};

export const resendCompanyCredentials = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const tenant = await Tenant.findById(id);
    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    const adminRole = await Role.findOne({ tenantId: id, name: 'Company Admin' }).lean();
    if (!adminRole) return res.status(404).json({ message: 'Company admin role not found' });

    const adminUser = await User.findOne({ tenantId: id, roleId: adminRole._id });
    if (!adminUser) return res.status(404).json({ message: 'Company admin user not found' });

    const newPassword = req.body?.newPassword;
    try {
      passwordSchema.parse(newPassword);
    } catch (zodError: any) {
      return res.status(400).json({ message: zodError?.errors?.[0]?.message || 'A valid new password is required' });
    }

    const salt = await bcrypt.genSalt(10);
    adminUser.passwordHash = await bcrypt.hash(newPassword, salt);
    await adminUser.save();

    const { subject, html } = buildCredentialsResetEmail({
      companyName: tenant.name,
      adminFirstName: adminUser.firstName,
      adminEmail: adminUser.email,
      adminPassword: newPassword,
      loginUrl: getLoginUrl(),
    });
    const emailResult = await sendMail({ to: adminUser.email, subject, html });

    tenant.credentialsEmailStatus = emailResult.sent ? 'SENT' : 'FAILED';
    if (emailResult.sent) tenant.credentialsEmailSentAt = new Date();
    if (!emailResult.sent && emailResult.error) tenant.credentialsEmailError = emailResult.error;
    await tenant.save();

    await writeAuditLog({
      tenantId: id,
      userId: req.user?._id,
      action: 'RESEND_CREDENTIALS',
      status: emailResult.sent ? 'SUCCESS' : 'FAILURE',
      details: { adminEmail: adminUser.email, credentialsEmailSent: emailResult.sent, error: emailResult.error },
    });

    res.status(200).json({
      credentialsEmailSent: emailResult.sent,
      credentialsEmailError: emailResult.error,
      adminEmail: adminUser.email,
      adminPasswordFallback: emailResult.sent ? undefined : newPassword,
    });
  } catch (error) {
    console.error('Error resending company credentials:', error);
    res.status(500).json({ message: 'Internal server error while resending credentials' });
  }
};

export const updateTenant = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const parsed = updateTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input', errors: parsed.error.issues });
    }
    const {
      name, packageId, isActive, aiCredits, country,
      adminFirstName, adminLastName, adminEmail, adminPassword,
      tradeName, industry, companyType, website, email, phone,
      addressLine1, addressLine2, city, state, postalCode,
      timezone, baseCurrency, financialYearStartMonth,
      panNumber, gstin, cin, tan, epfoNumber, esicNumber, ptNumber, lwfNumber,
      tin, ein, vatNumber, businessLicenseNumber,
      logoUrl, adminProfilePictureUrl,
      setupFeeAmount, setupFeeCurrency, setupFeeStatus,
      billingCycle, subscriptionAmount, subscriptionCurrency, subscriptionStatus,
    } = parsed.data;

    const existingTenant = await Tenant.findById(id);
    if (!existingTenant) return res.status(404).json({ message: 'Company not found' });

    const billingUpdate: any = {};
    if (setupFeeAmount !== undefined) billingUpdate.setupFeeAmount = setupFeeAmount;
    if (setupFeeCurrency !== undefined) billingUpdate.setupFeeCurrency = setupFeeCurrency;
    if (setupFeeStatus !== undefined) {
      billingUpdate.setupFeeStatus = setupFeeStatus;
      if (setupFeeStatus === 'PAID' && existingTenant.setupFeeStatus !== 'PAID') {
        billingUpdate.setupFeePaidAt = new Date();
      }
    }
    if (billingCycle !== undefined && billingCycle !== existingTenant.billingCycle) {
      billingUpdate.billingCycle = billingCycle;
      billingUpdate.nextRenewalDate = computeNextRenewalDate(existingTenant.subscriptionStartDate || new Date(), billingCycle);
    }
    if (subscriptionAmount !== undefined) billingUpdate.subscriptionAmount = subscriptionAmount;
    if (subscriptionCurrency !== undefined) billingUpdate.subscriptionCurrency = subscriptionCurrency;
    if (subscriptionStatus !== undefined) billingUpdate.subscriptionStatus = subscriptionStatus;

    const tenant = await Tenant.findByIdAndUpdate(
      id,
      {
        name,
        packageId,
        isActive,
        ...(aiCredits !== undefined && { aiCredits: Math.max(0, Number(aiCredits) || 0) }),
        ...billingUpdate,
      },
      { returnDocument: 'after' }
    );

    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    if (setupFeeStatus === 'PAID' && existingTenant.setupFeeStatus !== 'PAID' && tenant.setupFeeAmount > 0) {
      await Payment.create({
        tenantId: tenant._id,
        type: 'SETUP_FEE',
        amount: tenant.setupFeeAmount,
        currency: tenant.setupFeeCurrency,
        paidAt: new Date(),
        ...(req.user?._id && { recordedBy: req.user._id }),
      });
    }

    const updatePayload: any = {
      legalName: name, country, tradeName, industry, companyType, website, email, phone,
      addressLine1, addressLine2, city, state, postalCode,
      timezone, baseCurrency, financialYearStartMonth,
      panNumber, gstin, cin, tan, epfoNumber, esicNumber, ptNumber, lwfNumber,
      tin, ein, vatNumber, businessLicenseNumber
    };
    if (logoUrl) updatePayload.logoUrl = logoUrl;
    if (isActive !== undefined) {
      updatePayload.isActive = isActive;
    }

    await Company.updateMany({ tenantId: id as string }, { $set: updatePayload });
    const adminRole = await Role.findOne({ tenantId: id as string, name: 'Company Admin' }).lean();
    let adminUser = null;
    if (adminRole) {
      adminUser = await User.findOne({ tenantId: id as string, roleId: adminRole._id });
    }
    
    if (adminUser) {
      if (adminFirstName) adminUser.firstName = adminFirstName;
      if (adminLastName) adminUser.lastName = adminLastName;
      if (adminProfilePictureUrl) adminUser.profilePictureUrl = adminProfilePictureUrl;
      if (adminEmail) {
        if (adminEmail !== adminUser.email) {
          const existing = await User.findOne({ email: adminEmail }).setOptions({ bypassTenantIsolation: true });
          if (!existing) adminUser.email = adminEmail;
        }
      }
      if (adminPassword && adminPassword.trim() !== '') {
        try {
          passwordSchema.parse(adminPassword);
        } catch (zodError: any) {
          return res.status(400).json({ message: zodError?.errors?.[0]?.message || 'Invalid password format' });
        }
        const salt = await bcrypt.genSalt(10);
        adminUser.passwordHash = await bcrypt.hash(adminPassword, salt);
      }
      if (isActive !== undefined) {
        adminUser.isActive = isActive;
      }
      await adminUser.save();
    }

    // Also update all other users' isActive status
    if (isActive !== undefined) {
      if (adminUser) {
        await User.updateMany({ tenantId: id as string, _id: { $ne: adminUser._id } }, { isActive });
      } else {
        await User.updateMany({ tenantId: id as string }, { isActive });
      }
    }

    await writeAuditLog({
      tenantId: id,
      userId: req.user?._id,
      action: 'UPDATE_COMPANY',
      status: 'SUCCESS',
      details: { name, isActive, setupFeeStatus, billingCycle, subscriptionStatus },
    });

    res.status(200).json(tenant);
  } catch (error) {
    console.error('Error updating tenant:', error);
    res.status(500).json({ message: 'Internal server error while updating tenant' });
  }
};

export const deleteTenant = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const tenant = await Tenant.findByIdAndDelete(id);
    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    // Delete associated data
    await Company.deleteMany({ tenantId: id });
    await User.deleteMany({ tenantId: id });
    await Role.deleteMany({ tenantId: id });

    await writeAuditLog({
      tenantId: id,
      userId: req.user?._id,
      action: 'DELETE_COMPANY',
      status: 'SUCCESS',
      details: { name: tenant.name },
    });

    res.status(200).json({ message: 'Company and associated data deleted successfully' });
  } catch (error) {
    console.error('Error deleting tenant:', error);
    res.status(500).json({ message: 'Internal server error while deleting tenant' });
  }
};

export const markSetupFeePaid = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const tenant = await Tenant.findById(id);
    if (!tenant) return res.status(404).json({ message: 'Company not found' });
    if (tenant.setupFeeStatus === 'PAID') {
      return res.status(400).json({ message: 'Setup fee is already marked as paid' });
    }

    tenant.setupFeeStatus = 'PAID';
    tenant.setupFeePaidAt = new Date();
    await tenant.save();

    if (tenant.setupFeeAmount > 0) {
      await Payment.create({
        tenantId: tenant._id,
        type: 'SETUP_FEE',
        amount: tenant.setupFeeAmount,
        currency: tenant.setupFeeCurrency,
        paidAt: new Date(),
        ...(req.user?._id && { recordedBy: req.user._id }),
      });
    }

    await writeAuditLog({
      tenantId: id,
      userId: req.user?._id,
      action: 'MARK_SETUP_FEE_PAID',
      status: 'SUCCESS',
      details: { amount: tenant.setupFeeAmount, currency: tenant.setupFeeCurrency },
    });

    res.status(200).json(tenant);
  } catch (error) {
    console.error('Error marking setup fee paid:', error);
    res.status(500).json({ message: 'Internal server error while marking setup fee paid' });
  }
};

export const recordSubscriptionPayment = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const tenant = await Tenant.findById(id);
    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    const now = new Date();
    await Payment.create({
      tenantId: tenant._id,
      type: 'SUBSCRIPTION',
      amount: tenant.subscriptionAmount,
      currency: tenant.subscriptionCurrency,
      paidAt: now,
      ...(req.user?._id && { recordedBy: req.user._id }),
    });

    tenant.subscriptionStatus = 'ACTIVE';
    tenant.nextRenewalDate = computeNextRenewalDate(now, tenant.billingCycle);
    await tenant.save();

    await writeAuditLog({
      tenantId: id,
      userId: req.user?._id,
      action: 'RECORD_SUBSCRIPTION_PAYMENT',
      status: 'SUCCESS',
      details: { amount: tenant.subscriptionAmount, currency: tenant.subscriptionCurrency, nextRenewalDate: tenant.nextRenewalDate },
    });

    res.status(200).json(tenant);
  } catch (error) {
    console.error('Error recording subscription payment:', error);
    res.status(500).json({ message: 'Internal server error while recording subscription payment' });
  }
};

export const topUpAiCredits = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const credits = Number(req.body?.credits);
    if (!credits || credits <= 0) {
      return res.status(400).json({ message: 'credits must be a positive number' });
    }

    const tenant = await Tenant.findById(id).populate('packageId');
    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    const pkg = tenant.packageId as any;
    const pricePerCredit = pkg?.aiCreditTopUpPriceINR || 0;
    const amount = Math.round(pricePerCredit * credits);

    if (amount > 0) {
      await Payment.create({
        tenantId: tenant._id,
        type: 'AI_CREDIT_TOPUP',
        amount,
        currency: 'INR',
        paidAt: new Date(),
        notes: `${credits} AI credits`,
        ...(req.user?._id && { recordedBy: req.user._id }),
      });
    }

    tenant.aiCredits = (tenant.aiCredits || 0) + credits;
    await tenant.save();

    await writeAuditLog({
      tenantId: id,
      userId: req.user?._id,
      action: 'TOPUP_AI_CREDITS',
      status: 'SUCCESS',
      details: { credits, amount, currency: 'INR', newBalance: tenant.aiCredits },
    });

    res.status(200).json({ aiCredits: tenant.aiCredits, amountCharged: amount, currency: 'INR' });
  } catch (error) {
    console.error('Error topping up AI credits:', error);
    res.status(500).json({ message: 'Internal server error while topping up AI credits' });
  }
};

export const getAllPackages = async (req: AuthRequest, res: Response) => {
  try {
    const packages = await Package.find({ isActive: true });
    res.status(200).json(packages);
  } catch (error) {
    console.error('Error fetching packages:', error);
    res.status(500).json({ message: 'Internal server error while fetching packages' });
  }
};

export const getPackageById = async (req: AuthRequest, res: Response) => {
  try {
    const pkg = await Package.findById(req.params.id);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    res.status(200).json(pkg);
  } catch (error) {
    console.error('Error fetching package:', error);
    res.status(500).json({ message: 'Internal server error while fetching package' });
  }
};

export const createPackage = async (req: AuthRequest, res: Response) => {
  try {
    const {
<<<<<<< Updated upstream
      name, description, tier, maxCompanies, maxBranches, maxDepartments, maxDesignations, maxUsers, features,
      priceINR, priceUSD, pricePerUserMonthlyINR, pricePerUserMonthlyUSD, pricePerUserYearlyINR, pricePerUserYearlyUSD,
=======
      name, tier, description, maxCompanies, maxBranches, maxDepartments, maxDesignations, maxUsers, features,
      pricePerUserMonthlyINR, pricePerUserMonthlyUSD, pricePerUserYearlyINR, pricePerUserYearlyUSD,
>>>>>>> Stashed changes
      setupFeeINR, setupFeeUSD, freeAiCredits, aiCreditTopUpPriceINR, aiCreditTopUpPriceUSD,
    } = req.body;
    const newPackage = new Package({
      name,
      tier: tier || 'CUSTOM',
      description,
      tier,
      maxCompanies,
      maxBranches,
      maxDepartments,
      maxDesignations,
      maxUsers,
      features,
<<<<<<< Updated upstream
      priceINR,
      priceUSD,
      pricePerUserMonthlyINR,
      pricePerUserMonthlyUSD,
      pricePerUserYearlyINR,
      pricePerUserYearlyUSD,
      setupFeeINR,
      setupFeeUSD,
      freeAiCredits,
      aiCreditTopUpPriceINR,
      aiCreditTopUpPriceUSD,
=======
      pricePerUserMonthlyINR: pricePerUserMonthlyINR || 0,
      pricePerUserMonthlyUSD: pricePerUserMonthlyUSD || 0,
      pricePerUserYearlyINR: pricePerUserYearlyINR || 0,
      pricePerUserYearlyUSD: pricePerUserYearlyUSD || 0,
      setupFeeINR: setupFeeINR || 0,
      setupFeeUSD: setupFeeUSD || 0,
      freeAiCredits: freeAiCredits || 0,
      aiCreditTopUpPriceINR: aiCreditTopUpPriceINR || 0,
      aiCreditTopUpPriceUSD: aiCreditTopUpPriceUSD || 0,
>>>>>>> Stashed changes
      createdBy: req.user?._id
    });
    await newPackage.save();
    res.status(201).json(newPackage);
  } catch (error) {
    console.error('Error creating package:', error);
    res.status(500).json({ message: 'Internal server error while creating package' });
  }
};

export const updatePackage = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
<<<<<<< Updated upstream
      name, description, tier, maxCompanies, maxBranches, maxDepartments, maxDesignations, maxUsers, features,
      priceINR, priceUSD, pricePerUserMonthlyINR, pricePerUserMonthlyUSD, pricePerUserYearlyINR, pricePerUserYearlyUSD,
=======
      name, tier, description, maxCompanies, maxBranches, maxDepartments, maxDesignations, maxUsers, features,
      pricePerUserMonthlyINR, pricePerUserMonthlyUSD, pricePerUserYearlyINR, pricePerUserYearlyUSD,
>>>>>>> Stashed changes
      setupFeeINR, setupFeeUSD, freeAiCredits, aiCreditTopUpPriceINR, aiCreditTopUpPriceUSD, isActive,
    } = req.body;

    const updated = await Package.findByIdAndUpdate(
      id,
      {
        ...(name !== undefined && { name }),
        ...(tier !== undefined && { tier }),
        ...(description !== undefined && { description }),
        ...(tier !== undefined && { tier }),
        ...(maxCompanies !== undefined && { maxCompanies }),
        ...(maxBranches !== undefined && { maxBranches }),
        ...(maxDepartments !== undefined && { maxDepartments }),
        ...(maxDesignations !== undefined && { maxDesignations }),
        ...(maxUsers !== undefined && { maxUsers }),
        ...(features !== undefined && { features }),
<<<<<<< Updated upstream
        ...(priceINR !== undefined && { priceINR }),
        ...(priceUSD !== undefined && { priceUSD }),
=======
>>>>>>> Stashed changes
        ...(pricePerUserMonthlyINR !== undefined && { pricePerUserMonthlyINR }),
        ...(pricePerUserMonthlyUSD !== undefined && { pricePerUserMonthlyUSD }),
        ...(pricePerUserYearlyINR !== undefined && { pricePerUserYearlyINR }),
        ...(pricePerUserYearlyUSD !== undefined && { pricePerUserYearlyUSD }),
        ...(setupFeeINR !== undefined && { setupFeeINR }),
        ...(setupFeeUSD !== undefined && { setupFeeUSD }),
        ...(freeAiCredits !== undefined && { freeAiCredits }),
        ...(aiCreditTopUpPriceINR !== undefined && { aiCreditTopUpPriceINR }),
        ...(aiCreditTopUpPriceUSD !== undefined && { aiCreditTopUpPriceUSD }),
        ...(isActive !== undefined && { isActive }),
        updatedBy: req.user?._id,
      },
      { new: true },
    );

    if (!updated) return res.status(404).json({ message: 'Package not found' });
    res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating package:', error);
    res.status(500).json({ message: 'Internal server error while updating package' });
  }
};

export const getAllPermissions = async (req: AuthRequest, res: Response) => {
  try {
    const permissions = await Permission.find();
    res.status(200).json(permissions);
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ message: 'Internal server error while fetching permissions' });
  }
};

export const createPermission = async (req: AuthRequest, res: Response) => {
  try {
    const { name, module, description } = req.body;
    const newPerm = new Permission({ name, module, description, createdBy: req.user?._id });
    await newPerm.save();
    res.status(201).json(newPerm);
  } catch (error) {
    console.error('Error creating permission:', error);
    res.status(500).json({ message: 'Internal server error while creating permission' });
  }
};

export const getAllFeatures = async (_req: AuthRequest, res: Response) => {
  try {
    const features = await FeatureFlag.find().sort({ name: 1 }).lean();
    res.status(200).json(features);
  } catch (error) {
    console.error('Error fetching features:', error);
    res.status(500).json({ message: 'Internal server error while fetching features' });
  }
};

export const createFeature = async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, description, isActive = true } = req.body;
    const feature = new FeatureFlag({
      name,
      code,
      description,
      isActive,
      createdBy: req.user?._id,
    });
    await feature.save();
    res.status(201).json(feature);
  } catch (error) {
    console.error('Error creating feature:', error);
    res.status(500).json({ message: 'Internal server error while creating feature' });
  }
};

export const updateFeature = async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, description, isActive } = req.body;
    const feature = await FeatureFlag.findByIdAndUpdate(
      req.params.id,
      { name, code, description, isActive, updatedBy: req.user?._id },
      { returnDocument: 'after', runValidators: true }
    );
    if (!feature) return res.status(404).json({ message: 'Feature not found' });
    res.status(200).json(feature);
  } catch (error) {
    console.error('Error updating feature:', error);
    res.status(500).json({ message: 'Internal server error while updating feature' });
  }
};

export const deleteFeature = async (req: AuthRequest, res: Response) => {
  try {
    const feature = await FeatureFlag.findByIdAndUpdate(
      req.params.id,
      { isActive: false, updatedBy: req.user?._id },
      { returnDocument: 'after' }
    );
    if (!feature) return res.status(404).json({ message: 'Feature not found' });
    res.status(200).json({ message: 'Feature deleted successfully' });
  } catch (error) {
    console.error('Error deleting feature:', error);
    res.status(500).json({ message: 'Internal server error while deleting feature' });
  }
};

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const range = (req.query.range as string) || 'today';
    const { start, end } = resolveDateRange(range, req.query.from as string, req.query.to as string);

    const [totalTenants, activeTenants, totalPackages, totalFeatures] = await Promise.all([
      Tenant.countDocuments(),
      Tenant.countDocuments({ isActive: true }),
      Package.countDocuments(),
      FeatureFlag.countDocuments({ isActive: true }),
    ]);
    const totalUsers = await User.countDocuments({}).setOptions({ bypassTenantIsolation: true });

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const growthRangeStart = new Date();
    growthRangeStart.setMonth(growthRangeStart.getMonth() - 5);
    growthRangeStart.setDate(1);
    growthRangeStart.setHours(0, 0, 0, 0);

    const growthAgg = await Tenant.aggregate([
      { $match: { createdAt: { $gte: growthRangeStart } } },
      { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, count: { $sum: 1 } } },
    ]);

    const growth = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const match = growthAgg.find((g: any) => g._id.y === d.getFullYear() && g._id.m === d.getMonth() + 1);
      growth.push({ name: monthNames[d.getMonth()], value: match ? match.count : 0 });
    }

    const recentTenants = await Tenant.find()
      .populate('packageId', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // --- Range-scoped figures: revenue, new companies, activity ---
    const [paymentsInRange, newCompaniesInRange, activityCountInRange, recentAuditEvents] = await Promise.all([
      Payment.find({ paidAt: { $gte: start, $lt: end } }).lean(),
      Tenant.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      AuditLog.countDocuments({ createdAt: { $gte: start, $lt: end } }).setOptions({ bypassTenantIsolation: true }),
      AuditLog.find({ createdAt: { $gte: start, $lt: end } })
        .setOptions({ bypassTenantIsolation: true })
        .populate('userId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const revenueINR = paymentsInRange.reduce((sum, p: any) => sum + toINR(p.amount, p.currency), 0);
    const setupFeeRevenueINR = paymentsInRange
      .filter((p: any) => p.type === 'SETUP_FEE')
      .reduce((sum, p: any) => sum + toINR(p.amount, p.currency), 0);
    const subscriptionRevenueINR = paymentsInRange
      .filter((p: any) => p.type === 'SUBSCRIPTION')
      .reduce((sum, p: any) => sum + toINR(p.amount, p.currency), 0);
    const aiCreditRevenueINR = paymentsInRange
      .filter((p: any) => p.type === 'AI_CREDIT_TOPUP')
      .reduce((sum, p: any) => sum + toINR(p.amount, p.currency), 0);

    // --- Payment alerts: pending setup fees, past-due / overdue subscriptions ---
    const now = new Date();
    const atRiskTenants = await Tenant.find({
      $or: [
        { setupFeeStatus: 'PENDING' },
        { subscriptionStatus: 'PAST_DUE' },
        { subscriptionStatus: 'ACTIVE', nextRenewalDate: { $lte: now } },
      ],
    }).select('name setupFeeAmount setupFeeCurrency setupFeeStatus subscriptionAmount subscriptionCurrency subscriptionStatus nextRenewalDate billingCycle').limit(50).lean();

    const paymentAlerts = atRiskTenants.map((t: any) => {
      if (t.setupFeeStatus === 'PENDING') {
        return { tenantId: t._id, companyName: t.name, type: 'SETUP_FEE_PENDING', amount: t.setupFeeAmount, currency: t.setupFeeCurrency };
      }
      if (t.subscriptionStatus === 'PAST_DUE') {
        return { tenantId: t._id, companyName: t.name, type: 'SUBSCRIPTION_PAST_DUE', amount: t.subscriptionAmount, currency: t.subscriptionCurrency, nextRenewalDate: t.nextRenewalDate };
      }
      return { tenantId: t._id, companyName: t.name, type: 'RENEWAL_OVERDUE', amount: t.subscriptionAmount, currency: t.subscriptionCurrency, nextRenewalDate: t.nextRenewalDate };
    });

    res.status(200).json({
      range,
      rangeStart: start,
      rangeEnd: end,
      totalTenants,
      activeTenants,
      totalPackages,
      totalFeatures,
      totalUsers,
      growth,
      recentTenants,
      recentAuditEvents,
      revenueINR,
      setupFeeRevenueINR,
      subscriptionRevenueINR,
      aiCreditRevenueINR,
      paymentsCount: paymentsInRange.length,
      newCompaniesInRange,
      activityCountInRange,
      paymentAlerts,
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Internal server error while fetching dashboard stats' });
  }
};

export const getAllAuditLogsAcrossTenants = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (req.query.tenantId) query.tenantId = req.query.tenantId;
    if (req.query.module) query.module = req.query.module;
    if (req.query.status) query.status = req.query.status;
    if (req.query.search) {
      const search = new RegExp(String(req.query.search), 'i');
      query.$or = [{ action: search }, { module: search }];
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .setOptions({ bypassTenantIsolation: true })
        .populate('userId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(query).setOptions({ bypassTenantIsolation: true }),
    ]);

    const tenantIds = [...new Set(logs.map((l: any) => l.tenantId).filter(Boolean))];
    const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name').lean();
    const tenantNameById = new Map(tenants.map((t: any) => [String(t._id), t.name]));

    res.status(200).json({
      data: logs.map((l: any) => ({ ...l, tenantName: tenantNameById.get(String(l.tenantId)) || l.tenantId })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ message: 'Internal server error while fetching audit logs' });
  }
};

export const getAllPayments = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (req.query.type) query.type = req.query.type;
    if (req.query.tenantId) query.tenantId = req.query.tenantId;
    if (req.query.from || req.query.to) {
      query.paidAt = {};
      if (req.query.from) query.paidAt.$gte = new Date(String(req.query.from));
      if (req.query.to) {
        const end = new Date(String(req.query.to));
        end.setHours(23, 59, 59, 999);
        query.paidAt.$lte = end;
      }
    }

    const [payments, total] = await Promise.all([
      Payment.find(query)
        .populate('tenantId', 'name')
        .populate('recordedBy', 'firstName lastName email')
        .sort({ paidAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payment.countDocuments(query),
    ]);

    res.status(200).json({
      data: payments,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ message: 'Internal server error while fetching payments' });
  }
};

export const getAllTicketsAcrossTenants = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.priority) query.priority = req.query.priority;
    if (req.query.tenantId) query.tenantId = req.query.tenantId;
    if (req.query.search) {
      const search = new RegExp(String(req.query.search), 'i');
      query.$or = [{ subject: search }, { department: search }];
    }

    const [tickets, total, openCount, urgentCount] = await Promise.all([
      Ticket.find(query)
        .setOptions({ bypassTenantIsolation: true })
        .populate('tenantId', 'name')
        .populate('employeeId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Ticket.countDocuments(query).setOptions({ bypassTenantIsolation: true }),
      Ticket.countDocuments({ status: { $in: ['Open', 'In_Progress'] } }).setOptions({ bypassTenantIsolation: true }),
      Ticket.countDocuments({ priority: 'Urgent', status: { $in: ['Open', 'In_Progress'] } }).setOptions({ bypassTenantIsolation: true }),
    ]);

    res.status(200).json({
      data: tickets,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      openCount,
      urgentCount,
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ message: 'Internal server error while fetching tickets' });
  }
};

export const getAiUsageLogs = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string | undefined;
    if (!tenantId) return res.status(400).json({ message: 'tenantId query parameter is required' });

    const logs = await AiUsageLog.find({ tenantId } as any)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'VIEW_AI_USAGE_LOGS',
      module: 'AI',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { viewedTenantId: tenantId, resultCount: logs.length }
    } as any);

    res.status(200).json(logs);
  } catch (error) {
    console.error('Error fetching AI usage logs:', error);
    res.status(500).json({ message: 'Internal server error while fetching AI usage logs' });
  }
};

const resendCredentialsSchema = z.object({ newPassword: passwordSchema });

export const resendCredentials = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = resendCredentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const tenantId = req.params.id as string;
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    const adminRole = await Role.findOne({ tenantId, name: 'Company Admin' });
    let admin = adminRole ? await User.findOne({ tenantId, roleId: adminRole._id }) : null;

    const company = await Company.findOne({ tenantId });
    const targetFirstName = admin?.firstName || company?.pendingAdminFirstName || '';
    const targetEmail = admin?.email || company?.pendingAdminEmail;
    if (!targetEmail) return res.status(400).json({ message: 'No admin contact email found for this company' });

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);

    if (admin) {
      admin.passwordHash = passwordHash;
      await admin.save();
    } else {
      const role = adminRole || await new Role({
        name: 'Company Admin', description: 'Full access to company operations', permissions: ['*'],
        category: 'company_admin', tenantId, createdBy: req.user?._id,
      }).save();
      await new User({
        firstName: company?.pendingAdminFirstName, lastName: company?.pendingAdminLastName,
        email: targetEmail, passwordHash, roleId: role._id, tenantId, createdBy: req.user?._id,
      }).save();
    }

    const { subject, html } = buildCredentialsResetEmail({
      companyName: tenant.name, adminFirstName: targetFirstName, adminEmail: targetEmail,
      adminPassword: parsed.data.newPassword, loginUrl: getLoginUrl(),
    });
    const emailResult = await sendMail({ to: targetEmail, subject, html });

    await AuditLog.create({
      tenantId, userId: req.user?._id, action: 'RESEND_CREDENTIALS', module: 'CompanyLifecycle',
      status: 'SUCCESS', details: { adminEmail: targetEmail, emailSent: emailResult.sent },
    } as any);

    res.status(200).json({
      adminEmail: targetEmail,
      credentialsEmailSent: emailResult.sent,
      ...(emailResult.sent ? {} : { adminPasswordFallback: parsed.data.newPassword, credentialsEmailError: emailResult.error }),
    });
  } catch (error) {
    console.error('Error resending credentials:', error);
    res.status(500).json({ message: 'Internal server error while resending credentials' });
  }
};

const topUpSchema = z.object({ credits: z.coerce.number().positive('Credits must be greater than 0') });

export const topUpAiCredits = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = topUpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const tenantId = req.params.id as string;
    const tenant = await Tenant.findById(tenantId).populate('packageId');
    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    const pkg = tenant.packageId as any;
    const amountCharged = Math.round((pkg?.aiCreditTopUpPriceINR || 0) * parsed.data.credits);

    tenant.aiCredits = (tenant.aiCredits || 0) + parsed.data.credits;
    await tenant.save();

    if (amountCharged > 0) {
      await Payment.create({
        tenantId, type: 'AI_CREDIT_TOPUP', amount: amountCharged, currency: 'INR',
        paidAt: new Date(), gateway: 'MANUAL', notes: `Top-up of ${parsed.data.credits} AI credits`,
        ...(req.user?._id && { recordedBy: req.user._id }),
      });
    }

    await AuditLog.create({
      tenantId, userId: req.user?._id, action: 'TOPUP_AI_CREDITS', module: 'Billing',
      status: 'SUCCESS', details: { creditsAdded: parsed.data.credits, amountCharged, newBalance: tenant.aiCredits },
    } as any);

    res.status(200).json({ aiCredits: tenant.aiCredits, amountCharged });
  } catch (error) {
    console.error('Error topping up AI credits:', error);
    res.status(500).json({ message: 'Internal server error while topping up AI credits' });
  }
};

export const markSetupFeePaid = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.params.id as string;
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    tenant.setupFeeStatus = 'PAID';
    tenant.setupFeePaidAt = new Date();
    await tenant.save();

    if ((tenant.setupFeeAmount || 0) > 0) {
      await Payment.create({
        tenantId, type: 'SETUP_FEE', amount: tenant.setupFeeAmount, currency: tenant.setupFeeCurrency || 'INR',
        paidAt: new Date(), gateway: 'MANUAL', notes: 'Marked paid manually by Super Admin',
        ...(req.user?._id && { recordedBy: req.user._id }),
      });
    }

    await AuditLog.create({
      tenantId, userId: req.user?._id, action: 'MARK_SETUP_FEE_PAID', module: 'Billing',
      status: 'SUCCESS', details: { amount: tenant.setupFeeAmount },
    } as any);

    res.status(200).json(tenant);
  } catch (error) {
    console.error('Error marking setup fee paid:', error);
    res.status(500).json({ message: 'Internal server error while marking setup fee paid' });
  }
};

function computeNextRenewalDate(from: Date, billingCycle: 'MONTHLY' | 'YEARLY'): Date {
  const next = new Date(from);
  if (billingCycle === 'YEARLY') next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

export const recordSubscriptionPayment = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.params.id as string;
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    tenant.subscriptionStatus = 'ACTIVE';
    tenant.nextRenewalDate = computeNextRenewalDate(new Date(), tenant.billingCycle);
    await tenant.save();

    if ((tenant.subscriptionAmount || 0) > 0) {
      await Payment.create({
        tenantId, type: 'SUBSCRIPTION', amount: tenant.subscriptionAmount, currency: tenant.subscriptionCurrency || 'INR',
        paidAt: new Date(), gateway: 'MANUAL', notes: 'Recorded manually by Super Admin',
        ...(req.user?._id && { recordedBy: req.user._id }),
      });
    }

    await AuditLog.create({
      tenantId, userId: req.user?._id, action: 'RECORD_SUBSCRIPTION_PAYMENT', module: 'Billing',
      status: 'SUCCESS', details: { amount: tenant.subscriptionAmount, nextRenewalDate: tenant.nextRenewalDate },
    } as any);

    res.status(200).json(tenant);
  } catch (error) {
    console.error('Error recording subscription payment:', error);
    res.status(500).json({ message: 'Internal server error while recording subscription payment' });
  }
};

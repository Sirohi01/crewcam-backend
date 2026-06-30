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
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { buildCredentialsResetEmail, sendMail } from '../services/mailer';

function getLoginUrl(): string {
  return process.env.FRONTEND_LOGIN_URL || 'https://app.crewcam.com/login';
}

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

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
  try {
    const {
      name, packageId, aiCredits, adminFirstName, adminLastName, adminEmail, adminPassword, country,
      tradeName, industry, companyType, website, email, phone,
      addressLine1, addressLine2, city, state, postalCode,
      timezone, baseCurrency, financialYearStartMonth,
      panNumber, gstin, cin, tan, epfoNumber, esicNumber, ptNumber, lwfNumber,
      tin, ein, vatNumber, businessLicenseNumber,
      logoUrl, adminProfilePictureUrl
    } = req.body;
    const existingUser = await User.findOne({ email: adminEmail }).setOptions({ bypassTenantIsolation: true });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this admin email already exists' });
    }

    try {
      passwordSchema.parse(adminPassword);
    } catch (zodError: any) {
      return res.status(400).json({ message: zodError?.errors?.[0]?.message || 'Invalid password format' });
    }

    const tenant = new Tenant({
      name,
      packageId,
      aiCredits: Math.max(0, Number(aiCredits) || 0),
      createdBy: req.user?._id
    });
    await tenant.save();

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

    res.status(201).json(tenant);
  } catch (error) {
    console.error('Error creating tenant:', error);
    res.status(500).json({ message: 'Internal server error while creating tenant' });
  }
};

export const updateTenant = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name, packageId, isActive, aiCredits, country,
      adminFirstName, adminLastName, adminEmail, adminPassword,
      tradeName, industry, companyType, website, email, phone,
      addressLine1, addressLine2, city, state, postalCode,
      timezone, baseCurrency, financialYearStartMonth,
      panNumber, gstin, cin, tan, epfoNumber, esicNumber, ptNumber, lwfNumber,
      tin, ein, vatNumber, businessLicenseNumber,
      logoUrl, adminProfilePictureUrl
    } = req.body;

    const tenant = await Tenant.findByIdAndUpdate(
      id,
      {
        name,
        packageId,
        isActive,
        ...(aiCredits !== undefined && { aiCredits: Math.max(0, Number(aiCredits) || 0) }),
      },
      { returnDocument: 'after' }
    );

    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
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
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    // Delete associated data
    await Company.deleteMany({ tenantId: id });
    await User.deleteMany({ tenantId: id });
    await Role.deleteMany({ tenantId: id });

    res.status(200).json({ message: 'Tenant and associated data deleted successfully' });
  } catch (error) {
    console.error('Error deleting tenant:', error);
    res.status(500).json({ message: 'Internal server error while deleting tenant' });
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

export const createPackage = async (req: AuthRequest, res: Response) => {
  try {
    const {
      name, description, tier, maxCompanies, maxBranches, maxDepartments, maxDesignations, maxUsers, features,
      priceINR, priceUSD, pricePerUserMonthlyINR, pricePerUserMonthlyUSD, pricePerUserYearlyINR, pricePerUserYearlyUSD,
      setupFeeINR, setupFeeUSD, freeAiCredits, aiCreditTopUpPriceINR, aiCreditTopUpPriceUSD,
    } = req.body;
    const newPackage = new Package({
      name,
      description,
      tier,
      maxCompanies,
      maxBranches,
      maxDepartments,
      maxDesignations,
      maxUsers,
      features,
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
      name, description, tier, maxCompanies, maxBranches, maxDepartments, maxDesignations, maxUsers, features,
      priceINR, priceUSD, pricePerUserMonthlyINR, pricePerUserMonthlyUSD, pricePerUserYearlyINR, pricePerUserYearlyUSD,
      setupFeeINR, setupFeeUSD, freeAiCredits, aiCreditTopUpPriceINR, aiCreditTopUpPriceUSD, isActive,
    } = req.body;

    const updated = await Package.findByIdAndUpdate(
      id,
      {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(tier !== undefined && { tier }),
        ...(maxCompanies !== undefined && { maxCompanies }),
        ...(maxBranches !== undefined && { maxBranches }),
        ...(maxDepartments !== undefined && { maxDepartments }),
        ...(maxDesignations !== undefined && { maxDesignations }),
        ...(maxUsers !== undefined && { maxUsers }),
        ...(features !== undefined && { features }),
        ...(priceINR !== undefined && { priceINR }),
        ...(priceUSD !== undefined && { priceUSD }),
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

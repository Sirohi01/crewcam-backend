import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Tenant } from '../models/Tenant';
import { Company } from '../models/Company';
import { WhiteLabel } from '../models/WhiteLabel';
import { Package } from '../models/Package';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { CompanyLifecycleEvent } from '../models/CompanyLifecycleEvent';
import { z } from 'zod';

const wizardSchema = z.object({
  // Step 1 — Company Details
  name: z.string().trim().min(2, 'Company name must be at least 2 characters'),
  legalName: z.string().trim().min(2, 'Legal name must be at least 2 characters'),
  gstin: z.string().optional(),
  panNumber: z.string().optional(),
  cin: z.string().optional(),
  industry: z.string().optional(),
  website: z.string().optional(),
  companySize: z.string().optional(),
  logoUrl: z.string().optional(),
  description: z.string().max(1000).optional(),

  // Step 2 — Primary Contact
  ownerName: z.string().optional(),
  hrName: z.string().optional(),
  pendingAdminFirstName: z.string().trim().min(1, 'Admin first name is required'),
  pendingAdminLastName: z.string().trim().min(1, 'Admin last name is required'),
  pendingAdminEmail: z.string().trim().email('A valid admin email is required'),
  pendingAdminPhone: z.string().optional(),
  alternatePhone: z.string().optional(),

  // Step 3 — Address
  country: z.string().trim().min(1).default('India'),
  state: z.string().optional(),
  city: z.string().optional(),
  addressLine1: z.string().optional(),
  postalCode: z.string().optional(),
  timezone: z.string().optional().default('Asia/Kolkata'),
  baseCurrency: z.string().optional().default('INR'),

  // Step 4 — Subscription
  packageId: z.string().min(1, 'A subscription plan must be selected'),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional().default('MONTHLY'),
  userLimit: z.coerce.number().min(1).optional(),
  storageLimitGB: z.coerce.number().min(1).optional().default(5),
  dbType: z.enum(['SHARED', 'DEDICATED']).optional().default('SHARED'),

  // Step 5 — Module Selection
  selectedModules: z.array(z.string()).optional().default([]),

  // Step 6 — Organization Setup (planning only — nothing is created yet)
  organizationSetupPlan: z.object({
    branchesPlanned: z.coerce.number().min(0).optional().default(0),
    departmentsPlanned: z.coerce.number().min(0).optional().default(0),
    designationsPlanned: z.coerce.number().min(0).optional().default(0),
    shiftsPlanned: z.coerce.number().min(0).optional().default(0),
    needsHolidayCalendar: z.boolean().optional().default(false),
    needsLeavePolicy: z.boolean().optional().default(false),
    needsApprovalMatrix: z.boolean().optional().default(false),
    needsCustomRoles: z.boolean().optional().default(false),
  }).optional(),

  // Step 7 — Branding
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  customSubdomain: z.string().optional(),
  emailFromName: z.string().optional(),
  emailFromAddress: z.string().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().optional(),
  smtpUsername: z.string().optional(),
  whatsappEnabled: z.boolean().optional().default(false),
  whatsappNumber: z.string().optional(),
});

function computeNextRenewalDate(from: Date, billingCycle: 'MONTHLY' | 'YEARLY'): Date {
  const next = new Date(from);
  if (billingCycle === 'YEARLY') next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Phase 6 — Company Creation Wizard. Captures every step's data and creates the
 * Tenant/Company/WhiteLabel records, but deliberately stops short of workspace
 * provisioning: no Company Admin role, no login user, no credentials email. That
 * happens later, when a Super Admin advances this company's lifecycle to
 * ADMIN_CREDENTIALS_GENERATED (see companyLifecycleController.recordLifecycleTransition).
 */
export const createCompanyDraft = async (req: AuthRequest, res: Response) => {
  let createdTenantId: any = null;
  try {
    const parsed = wizardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input', errors: parsed.error.issues });
    }
    const data = parsed.data;

    const existingAdmin = await User.findOne({ email: data.pendingAdminEmail }).setOptions({ bypassTenantIsolation: true });
    if (existingAdmin) {
      return res.status(400).json({ message: 'A user with this admin email already exists' });
    }

    const pkg = await Package.findById(data.packageId);
    if (!pkg || !pkg.isActive) {
      return res.status(400).json({ message: 'Selected plan does not exist or is inactive' });
    }

    const subscriptionStartDate = new Date();
    const nextRenewalDate = computeNextRenewalDate(subscriptionStartDate, data.billingCycle);
    const perUserPrice = data.billingCycle === 'YEARLY' ? pkg.pricePerUserYearlyINR : pkg.pricePerUserMonthlyINR;
    const userLimit = data.userLimit || pkg.maxUsers;

    const tenant = new Tenant({
      name: data.name,
      packageId: data.packageId,
      aiCredits: pkg.freeAiCredits || 0,
      setupFeeAmount: pkg.setupFeeINR || 0,
      setupFeeCurrency: 'INR',
      setupFeeStatus: 'PENDING',
      billingCycle: data.billingCycle,
      subscriptionAmount: (perUserPrice || 0) * userLimit,
      subscriptionCurrency: 'INR',
      subscriptionStatus: 'PENDING',
      subscriptionStartDate,
      nextRenewalDate,
      lifecycleStatus: 'SUBSCRIPTION_PENDING',
      lifecycleUpdatedAt: new Date(),
      userLimit,
      storageLimitGB: data.storageLimitGB,
      dbType: data.dbType,
      createdBy: req.user?._id,
    });
    await tenant.save();
    createdTenantId = tenant._id;

    const company = new Company({
      legalName: data.legalName,
      tradeName: data.name,
      industry: data.industry,
      website: data.website,
      email: data.pendingAdminEmail,
      phone: data.pendingAdminPhone,
      addressLine1: data.addressLine1,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
      country: data.country,
      timezone: data.timezone,
      baseCurrency: data.baseCurrency,
      panNumber: data.panNumber,
      gstin: data.gstin,
      cin: data.cin,
      logoUrl: data.logoUrl,
      companySize: data.companySize,
      description: data.description,
      ownerName: data.ownerName,
      hrName: data.hrName,
      alternatePhone: data.alternatePhone,
      pendingAdminFirstName: data.pendingAdminFirstName,
      pendingAdminLastName: data.pendingAdminLastName,
      pendingAdminEmail: data.pendingAdminEmail,
      pendingAdminPhone: data.pendingAdminPhone,
      selectedModules: data.selectedModules,
      ...(data.organizationSetupPlan && { organizationSetupPlan: data.organizationSetupPlan }),
      tenantId: tenant._id,
      createdBy: req.user?._id,
    });
    await company.save();

    await WhiteLabel.create({
      tenantId: tenant._id,
      logoUrl: data.logoUrl,
      ...(data.primaryColor && { primaryColor: data.primaryColor }),
      secondaryColor: data.secondaryColor,
      customSubdomain: data.customSubdomain,
      emailFromName: data.emailFromName,
      emailFromAddress: data.emailFromAddress,
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUsername: data.smtpUsername,
      whatsappEnabled: data.whatsappEnabled,
      whatsappNumber: data.whatsappNumber,
      ...(req.user?._id && { createdBy: req.user._id }),
    } as any);

    await CompanyLifecycleEvent.create({
      tenantId: tenant._id,
      toStatus: 'SUBSCRIPTION_PENDING',
      note: 'Created via the Company Creation Wizard. Workspace not yet provisioned — no login account exists.',
      ...(req.user?._id && { changedBy: req.user._id }),
    });

    await AuditLog.create({
      tenantId: String(tenant._id),
      userId: req.user?._id,
      action: 'CREATE_COMPANY_DRAFT',
      module: 'CompanyLifecycle',
      status: 'SUCCESS',
      details: { name: data.name, packageId: data.packageId, pendingAdminEmail: data.pendingAdminEmail },
    } as any);

    res.status(201).json({ tenant, companyId: company._id });
  } catch (error) {
    console.error('Error creating company draft:', error);
    if (createdTenantId) {
      await Promise.all([
        Tenant.findByIdAndDelete(createdTenantId),
        Company.deleteMany({ tenantId: createdTenantId }),
        WhiteLabel.deleteMany({ tenantId: createdTenantId }),
        CompanyLifecycleEvent.deleteMany({ tenantId: createdTenantId }),
      ]).catch((rollbackErr) => console.error('Rollback failed:', rollbackErr));
    }
    res.status(500).json({ message: 'Internal server error while creating company draft' });
  }
};

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Tenant, LIFECYCLE_STATUSES, LIFECYCLE_SEQUENCE, LifecycleStatus } from '../models/Tenant';
import { CompanyLifecycleEvent } from '../models/CompanyLifecycleEvent';
import { AuditLog } from '../models/AuditLog';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { Role } from '../models/Role';
import { Invoice } from '../models/Invoice';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { buildCompanyWelcomeEmail, sendMail } from '../services/mailer';

function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  const body = Array.from({ length: 9 }, () => pick(lower)).join('');
  return `${pick(upper)}${body}${pick(digits)}${pick(digits)}`;
}

function getLoginUrl(): string {
  return process.env.FRONTEND_LOGIN_URL || 'https://app.crewcam.com/login';
}

/**
 * Companies created through the Wizard (Phase 6) have no login account yet — only
 * pendingAdmin* fields captured on Company. The first time a company's lifecycle reaches
 * ADMIN_CREDENTIALS_GENERATED, this creates the Company Admin role + user from that pending
 * data and emails the credentials. Idempotent: skipped if an admin user already exists
 * (e.g. companies created via the quick-create form, which provisions this upfront).
 */
async function maybeProvisionAdminAccount(tenant: any, changedBy?: any): Promise<{ credentialsEmailSent?: boolean; adminPasswordFallback?: string; adminEmail?: string } | null> {
  const existingRole = await Role.findOne({ tenantId: String(tenant._id), name: 'Company Admin' }).lean();
  const existingAdmin = existingRole
    ? await User.findOne({ tenantId: String(tenant._id), roleId: existingRole._id }).lean()
    : null;
  if (existingAdmin) return null;

  const company = await Company.findOne({ tenantId: String(tenant._id) });
  if (!company?.pendingAdminEmail) return null;

  const adminRole = existingRole || await new Role({
    name: 'Company Admin',
    description: 'Full access to company operations',
    permissions: ['*'],
    category: 'company_admin',
    tenantId: tenant._id,
    ...(changedBy && { createdBy: changedBy }),
  }).save();

  const password = generateTempPassword();
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  await new User({
    firstName: company.pendingAdminFirstName,
    lastName: company.pendingAdminLastName,
    email: company.pendingAdminEmail,
    passwordHash,
    roleId: adminRole._id,
    tenantId: tenant._id,
    ...(changedBy && { createdBy: changedBy }),
  }).save();

  const { subject, html } = buildCompanyWelcomeEmail({
    companyName: tenant.name,
    adminFirstName: company.pendingAdminFirstName || '',
    adminEmail: company.pendingAdminEmail,
    adminPassword: password,
    loginUrl: getLoginUrl(),
  });
  const emailResult = await sendMail({ to: company.pendingAdminEmail, subject, html });

  tenant.credentialsEmailStatus = emailResult.sent ? 'SENT' : 'FAILED';
  if (emailResult.sent) tenant.credentialsEmailSentAt = new Date();
  if (!emailResult.sent && emailResult.error) tenant.credentialsEmailError = emailResult.error;
  await tenant.save();

  return {
    credentialsEmailSent: emailResult.sent,
    adminEmail: company.pendingAdminEmail,
    ...(emailResult.sent ? {} : { adminPasswordFallback: password }),
  };
}

const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  LEAD: 'Lead',
  DEMO_SCHEDULED: 'Demo Scheduled',
  PROPOSAL_SENT: 'Proposal Sent',
  QUOTATION_APPROVED: 'Quotation Approved',
  SUBSCRIPTION_PENDING: 'Subscription Pending',
  SUBSCRIPTION_PAID: 'Subscription Paid',
  SETUP_FEE_PENDING: 'Setup Fee Pending',
  SETUP_FEE_PAID: 'Setup Fee Paid',
  IMPLEMENTATION_IN_PROGRESS: 'Implementation In Progress',
  WORKSPACE_PROVISIONING: 'Workspace Provisioning',
  CONFIGURATION: 'Configuration',
  QA_VERIFICATION: 'QA Verification',
  ADMIN_CREDENTIALS_GENERATED: 'Admin Credentials Generated',
  ACTIVATION_PENDING: 'Activation Pending',
  ACTIVE: 'Active',
  LIVE: 'Live',
  SUSPENDED: 'Suspended',
  EXPIRED: 'Expired',
  CLOSED: 'Closed',
};

const setStatusSchema = z.object({
  status: z.enum(LIFECYCLE_STATUSES),
  note: z.string().optional(),
});

/**
 * Single choke point for every lifecycle transition: updates the Tenant, and — per the
 * module spec — always writes an Audit Log entry, a Timeline entry, and (once the company
 * has at least one user) a Notification. The Activity Log is the same AuditLog feed,
 * already surfaced on the Dashboard and the Audit Logs page.
 */
export async function recordLifecycleTransition(params: {
  tenantId: string;
  toStatus: LifecycleStatus;
  note?: string;
  changedBy?: any;
}) {
  const { tenantId, toStatus, note, changedBy } = params;
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error('Company not found');

  const fromStatus = tenant.lifecycleStatus;
  tenant.lifecycleStatus = toStatus;
  tenant.lifecycleUpdatedAt = new Date();
  await tenant.save();

  let provisioning: { credentialsEmailSent?: boolean; adminPasswordFallback?: string; adminEmail?: string } | null = null;
  if (toStatus === 'ADMIN_CREDENTIALS_GENERATED') {
    provisioning = await maybeProvisionAdminAccount(tenant, changedBy);
  }

  await CompanyLifecycleEvent.create({
    tenantId: tenant._id,
    fromStatus,
    toStatus,
    note: provisioning ? `${note ? note + ' — ' : ''}Admin account created and credentials ${provisioning.credentialsEmailSent ? 'emailed' : 'generated (email delivery failed)'}.` : note,
    ...(changedBy && { changedBy }),
  });

  await AuditLog.create({
    tenantId: String(tenant._id),
    userId: changedBy,
    action: 'LIFECYCLE_STATUS_CHANGE',
    module: 'CompanyLifecycle',
    status: 'SUCCESS',
    details: { fromStatus, toStatus, note, provisioning },
  } as any);

  const recipientExists = await User.exists({ tenantId: String(tenant._id) });
  if (recipientExists && changedBy) {
    await Notification.create({
      tenantId: tenant._id,
      title: `Company status: ${LIFECYCLE_LABELS[toStatus]}`,
      message: note || `${tenant.name} moved from ${LIFECYCLE_LABELS[fromStatus] || 'N/A'} to ${LIFECYCLE_LABELS[toStatus]}.`,
      audienceType: 'All',
      createdBy: changedBy,
      readBy: [],
    });
  }

  return { tenant, provisioning };
}

export const getLifecycleTimeline = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.params.id as string;
    const tenant = await Tenant.findById(tenantId)
      .select('name lifecycleStatus lifecycleUpdatedAt packageId billingCycle subscriptionAmount userLimit')
      .populate('packageId', 'name tier');
    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    const events = await CompanyLifecycleEvent.find({ tenantId })
      .populate('changedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      tenant: {
        _id: tenant._id, name: tenant.name, lifecycleStatus: tenant.lifecycleStatus, lifecycleUpdatedAt: tenant.lifecycleUpdatedAt,
        packageId: tenant.packageId, billingCycle: tenant.billingCycle, subscriptionAmount: tenant.subscriptionAmount, userLimit: tenant.userLimit,
      },
      sequence: LIFECYCLE_SEQUENCE,
      labels: LIFECYCLE_LABELS,
      events,
    });
  } catch (error) {
    console.error('Error fetching lifecycle timeline:', error);
    res.status(500).json({ message: 'Internal server error while fetching lifecycle timeline' });
  }
};

export const advanceLifecycle = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.params.id as string;
    const tenant = await Tenant.findById(tenantId).select('lifecycleStatus');
    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    const currentIndex = LIFECYCLE_SEQUENCE.indexOf(tenant.lifecycleStatus);
    if (currentIndex === -1) {
      return res.status(400).json({ message: `Company is in '${tenant.lifecycleStatus}' — use 'Set Status' to move it back into the standard sequence first.` });
    }
    if (currentIndex === LIFECYCLE_SEQUENCE.length - 1) {
      return res.status(400).json({ message: 'Company is already at the final stage of the standard sequence.' });
    }

    const nextStatus = LIFECYCLE_SEQUENCE[currentIndex + 1]!;
    const { tenant: updated, provisioning } = await recordLifecycleTransition({
      tenantId,
      toStatus: nextStatus,
      ...(req.body?.note && { note: req.body.note }),
      ...(req.user?._id && { changedBy: req.user._id }),
    });

    res.status(200).json({ ...updated.toObject(), provisioning });
  } catch (error: any) {
    console.error('Error advancing lifecycle:', error);
    res.status(500).json({ message: error.message || 'Internal server error while advancing lifecycle' });
  }
};

export const setLifecycleStatus = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = setStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const tenantId = req.params.id as string;
    const exists = await Tenant.exists({ _id: tenantId });
    if (!exists) return res.status(404).json({ message: 'Company not found' });

    const { tenant: updated, provisioning } = await recordLifecycleTransition({
      tenantId,
      toStatus: parsed.data.status,
      ...(parsed.data.note && { note: parsed.data.note }),
      ...(req.user?._id && { changedBy: req.user._id }),
    });

    res.status(200).json({ ...updated.toObject(), provisioning });
  } catch (error: any) {
    console.error('Error setting lifecycle status:', error);
    res.status(500).json({ message: error.message || 'Internal server error while setting lifecycle status' });
  }
};

/**
 * The "Provision Workspace" button — only enabled once both the setup fee and the
 * subscription have actually been paid. Falls back to the legacy Tenant.setupFeeStatus/
 * subscriptionStatus flags for companies that never went through the formal Invoice flow
 * (e.g. quick-create), so this doesn't regress companies created before Phase 7.
 */
export const provisionWorkspace = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.params.id as string;
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    const [setupInvoice, subscriptionInvoice] = await Promise.all([
      Invoice.findOne({ tenantId, type: 'SETUP_FEE' }).sort({ createdAt: -1 }),
      Invoice.findOne({ tenantId, type: 'SUBSCRIPTION' }).sort({ createdAt: -1 }),
    ]);

    const setupPaid = setupInvoice ? setupInvoice.status === 'PAID' : (tenant.setupFeeStatus === 'PAID' || tenant.setupFeeStatus === 'WAIVED');
    const subscriptionPaid = subscriptionInvoice ? subscriptionInvoice.status === 'PAID' : tenant.subscriptionStatus === 'ACTIVE';

    if (!setupPaid || !subscriptionPaid) {
      const missing = [!setupPaid && 'Setup Fee', !subscriptionPaid && 'Subscription'].filter(Boolean).join(' and ');
      return res.status(400).json({ message: `Cannot provision workspace — ${missing} payment is not yet complete.` });
    }

    const currentIndex = LIFECYCLE_SEQUENCE.indexOf(tenant.lifecycleStatus);
    const targetIndex = LIFECYCLE_SEQUENCE.indexOf('WORKSPACE_PROVISIONING');
    if (currentIndex >= targetIndex) {
      return res.status(200).json({ ...tenant.toObject(), alreadyProvisioned: true });
    }

    const { tenant: updated } = await recordLifecycleTransition({
      tenantId,
      toStatus: 'WORKSPACE_PROVISIONING',
      note: 'Workspace provisioning started — setup fee and subscription payment confirmed.',
      ...(req.user?._id && { changedBy: req.user._id }),
    });

    res.status(200).json(updated);
  } catch (error: any) {
    console.error('Error provisioning workspace:', error);
    res.status(500).json({ message: error.message || 'Internal server error while provisioning workspace' });
  }
};

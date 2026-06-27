import { Tenant, LIFECYCLE_SEQUENCE } from '../models/Tenant';
import { Lead } from '../models/Lead';
import { Invoice } from '../models/Invoice';
import { AutomationRule, AutomationRuleType } from '../models/AutomationRule';
import { AutomationLog } from '../models/AutomationLog';
import { resolveCompanyContactEmail } from '../controllers/billingController';
import { recordLifecycleTransition } from '../controllers/companyLifecycleController';
import { sendMail } from './mailer';

async function logResult(type: AutomationRuleType, message: string, extra?: { tenantId?: any; leadId?: any; status?: 'SUCCESS' | 'FAILURE'; details?: Record<string, any> }) {
  await AutomationLog.create({ type, message, status: extra?.status || 'SUCCESS', ...extra } as any);
}

async function getOrCreateRule(type: AutomationRuleType) {
  let rule = await AutomationRule.findOne({ type });
  if (!rule) rule = await AutomationRule.create({ type } as any);
  return rule;
}

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/** Reminds tenants with a pending setup fee, a past-due subscription, or an overdue renewal — throttled by intervalDays per tenant. */
export async function runPaymentReminders() {
  const rule = await getOrCreateRule('PAYMENT_REMINDER');
  if (!rule.isEnabled) return { checked: 0, sent: 0 };

  const cutoff = daysAgo(rule.intervalDays);
  const now = new Date();
  const candidates = await Tenant.find({
    isActive: true,
    $or: [
      { setupFeeStatus: 'PENDING' },
      { subscriptionStatus: 'PAST_DUE' },
      { subscriptionStatus: 'ACTIVE', nextRenewalDate: { $lt: now } },
    ],
    $and: [{ $or: [{ lastPaymentReminderAt: null }, { lastPaymentReminderAt: { $lt: cutoff } }] }],
  });

  let sent = 0;
  for (const tenant of candidates) {
    const reason = tenant.setupFeeStatus === 'PENDING' && (tenant.setupFeeAmount || 0) > 0
      ? `setup fee of ${tenant.setupFeeCurrency} ${tenant.setupFeeAmount} is pending`
      : tenant.subscriptionStatus === 'PAST_DUE'
        ? 'subscription payment is past due'
        : 'subscription renewal is overdue';

    const email = await resolveCompanyContactEmail(String(tenant._id));
    if (!email) {
      await logResult('PAYMENT_REMINDER', `Skipped ${tenant.name} — no contact email on file`, { tenantId: tenant._id, status: 'FAILURE' });
      continue;
    }

    const result = await sendMail({
      to: email,
      subject: `Action needed: ${tenant.name}'s CrewCam HR Cloud account`,
      html: `<p>Hi,</p><p>Your ${reason}. Please reach out to your CrewCam account representative to resolve this and avoid service interruption.</p>`,
    });

    tenant.lastPaymentReminderAt = now;
    await tenant.save();
    sent += 1;
    await logResult('PAYMENT_REMINDER', `Reminded ${tenant.name} — ${reason}`, { tenantId: tenant._id, status: result.sent ? 'SUCCESS' : 'FAILURE', details: { email, reason } });
  }

  rule.lastRunAt = now;
  await rule.save();
  return { checked: candidates.length, sent };
}

/** Flags leads that have sat in a non-terminal stage for longer than intervalDays — throttled per lead. */
export async function runLeadFollowUps() {
  const rule = await getOrCreateRule('LEAD_FOLLOWUP');
  if (!rule.isEnabled) return { checked: 0, flagged: 0 };

  const cutoff = daysAgo(rule.intervalDays);
  const now = new Date();
  const candidates = await Lead.find({
    stage: { $nin: ['WON', 'LOST'] },
    updatedAt: { $lt: cutoff },
    $or: [{ lastFollowUpReminderAt: null }, { lastFollowUpReminderAt: { $lt: cutoff } }],
  });

  let flagged = 0;
  for (const lead of candidates) {
    const daysStalled = Math.floor((now.getTime() - lead.updatedAt.getTime()) / (24 * 60 * 60 * 1000));
    await logResult('LEAD_FOLLOWUP', `${lead.companyName} has been stuck in ${lead.stage} for ${daysStalled} days — needs follow-up`, { leadId: lead._id });
    lead.lastFollowUpReminderAt = now;
    await lead.save();
    flagged += 1;
  }

  rule.lastRunAt = now;
  await rule.save();
  return { checked: candidates.length, flagged };
}

/** Auto-advances a tenant to WORKSPACE_PROVISIONING once both setup fee and subscription are confirmed paid — mirrors the manual "Provision Workspace" button. */
export async function runLifecycleAutoAdvance() {
  const rule = await getOrCreateRule('LIFECYCLE_AUTO_ADVANCE');
  if (!rule.isEnabled) return { checked: 0, advanced: 0 };

  const targetIndex = LIFECYCLE_SEQUENCE.indexOf('WORKSPACE_PROVISIONING');
  const candidates = await Tenant.find({
    isActive: true,
    lifecycleStatus: { $in: LIFECYCLE_SEQUENCE.slice(0, targetIndex) },
    $or: [{ setupFeeStatus: 'PAID' }, { setupFeeStatus: 'WAIVED' }],
    subscriptionStatus: 'ACTIVE',
  });

  let advanced = 0;
  for (const tenant of candidates) {
    const [setupInvoice, subscriptionInvoice] = await Promise.all([
      Invoice.findOne({ tenantId: tenant._id, type: 'SETUP_FEE' }).sort({ createdAt: -1 }),
      Invoice.findOne({ tenantId: tenant._id, type: 'SUBSCRIPTION' }).sort({ createdAt: -1 }),
    ]);
    const setupPaid = setupInvoice ? setupInvoice.status === 'PAID' : (tenant.setupFeeStatus === 'PAID' || tenant.setupFeeStatus === 'WAIVED');
    const subscriptionPaid = subscriptionInvoice ? subscriptionInvoice.status === 'PAID' : tenant.subscriptionStatus === 'ACTIVE';
    if (!setupPaid || !subscriptionPaid) continue;

    await recordLifecycleTransition({
      tenantId: String(tenant._id),
      toStatus: 'WORKSPACE_PROVISIONING',
      note: 'Auto-advanced by Automation — setup fee and subscription payment confirmed.',
    });
    await logResult('LIFECYCLE_AUTO_ADVANCE', `${tenant.name} auto-advanced to Workspace Provisioning`, { tenantId: tenant._id });
    advanced += 1;
  }

  rule.lastRunAt = new Date();
  await rule.save();
  return { checked: candidates.length, advanced };
}

/** Flags tenants whose AI credit balance has dropped below the configured threshold — throttled to once a day. */
export async function runAiCreditsLowAlert() {
  const rule = await getOrCreateRule('AI_CREDITS_LOW');
  if (!rule.isEnabled) return { checked: 0, flagged: 0 };

  const cutoff = daysAgo(1);
  const now = new Date();
  const candidates = await Tenant.find({
    isActive: true,
    aiCredits: { $lt: rule.threshold },
    $or: [{ lastAiCreditsAlertAt: null }, { lastAiCreditsAlertAt: { $lt: cutoff } }],
  });

  let flagged = 0;
  for (const tenant of candidates) {
    await logResult('AI_CREDITS_LOW', `${tenant.name} has only ${tenant.aiCredits} AI credits left (threshold ${rule.threshold})`, { tenantId: tenant._id });
    tenant.lastAiCreditsAlertAt = now;
    await tenant.save();
    flagged += 1;
  }

  rule.lastRunAt = now;
  await rule.save();
  return { checked: candidates.length, flagged };
}

export async function runAllAutomationChecks() {
  const [paymentReminders, leadFollowUps, lifecycleAutoAdvance, aiCreditsLow] = await Promise.all([
    runPaymentReminders().catch((err) => ({ error: err.message })),
    runLeadFollowUps().catch((err) => ({ error: err.message })),
    runLifecycleAutoAdvance().catch((err) => ({ error: err.message })),
    runAiCreditsLowAlert().catch((err) => ({ error: err.message })),
  ]);
  return { paymentReminders, leadFollowUps, lifecycleAutoAdvance, aiCreditsLow };
}

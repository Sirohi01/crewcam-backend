import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Tenant } from '../models/Tenant';
import { Package } from '../models/Package';
import { AuditLog } from '../models/AuditLog';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { z } from 'zod';

const TIER_RANK: Record<string, number> = { BASIC: 1, PROFESSIONAL: 2, ENTERPRISE: 3, CUSTOM: 0 };

const changePlanSchema = z.object({
  packageId: z.string().min(1, 'A package must be selected'),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional(),
});

export const changePlan = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = changePlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const tenantId = req.params.id as string;
    const tenant = await Tenant.findById(tenantId).populate('packageId');
    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    const newPackage = await Package.findById(parsed.data.packageId);
    if (!newPackage || !newPackage.isActive) {
      return res.status(400).json({ message: 'Selected package does not exist or is inactive' });
    }

    const oldPackage = tenant.packageId as any;
    if (oldPackage && String(oldPackage._id) === String(newPackage._id) && !parsed.data.billingCycle) {
      return res.status(400).json({ message: 'Company is already on this plan' });
    }

    const billingCycle = parsed.data.billingCycle || tenant.billingCycle;
    const perUserPrice = billingCycle === 'YEARLY' ? newPackage.pricePerUserYearlyINR : newPackage.pricePerUserMonthlyINR;
    const newSubscriptionAmount = (perUserPrice || 0) * (tenant.userLimit || newPackage.maxUsers);

    const oldRank = TIER_RANK[oldPackage?.tier || 'CUSTOM'] ?? 0;
    const newRank = TIER_RANK[newPackage.tier || 'CUSTOM'] ?? 0;
    let direction: 'UPGRADE' | 'DOWNGRADE' | 'CHANGED' = 'CHANGED';
    if (oldPackage?.tier !== 'CUSTOM' && newPackage.tier !== 'CUSTOM') {
      direction = newRank > oldRank ? 'UPGRADE' : newRank < oldRank ? 'DOWNGRADE' : 'CHANGED';
    } else if (newSubscriptionAmount !== tenant.subscriptionAmount) {
      direction = newSubscriptionAmount > tenant.subscriptionAmount ? 'UPGRADE' : 'DOWNGRADE';
    }

    const fromPackageName = oldPackage?.name || 'Custom';
    const previousAmount = tenant.subscriptionAmount;

    tenant.packageId = newPackage._id as any;
    tenant.billingCycle = billingCycle;
    tenant.subscriptionAmount = newSubscriptionAmount;
    await tenant.save();

    await AuditLog.create({
      tenantId: String(tenant._id),
      userId: req.user?._id,
      action: 'CHANGE_PLAN',
      module: 'Billing',
      status: 'SUCCESS',
      details: {
        direction,
        fromPackage: fromPackageName,
        toPackage: newPackage.name,
        billingCycle,
        previousSubscriptionAmount: previousAmount,
        newSubscriptionAmount,
      },
    } as any);

    const recipientExists = await User.exists({ tenantId: String(tenant._id) });
    if (recipientExists) {
      await Notification.create({
        tenantId: tenant._id,
        title: `Plan ${direction === 'UPGRADE' ? 'upgraded' : direction === 'DOWNGRADE' ? 'downgraded' : 'changed'}`,
        message: `${tenant.name} moved from ${fromPackageName} to ${newPackage.name}. New subscription amount: ₹${newSubscriptionAmount}/${billingCycle === 'YEARLY' ? 'year' : 'month'}. This takes effect from the next billing cycle — no proration was applied.`,
        audienceType: 'All',
        ...(req.user?._id && { createdBy: req.user._id }),
        readBy: [],
      });
    }

    const updated = await Tenant.findById(tenant._id).populate('packageId');
    res.status(200).json({ tenant: updated, direction, previousSubscriptionAmount: previousAmount, newSubscriptionAmount });
  } catch (error) {
    console.error('Error changing plan:', error);
    res.status(500).json({ message: 'Internal server error while changing plan' });
  }
};

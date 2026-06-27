import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Tenant } from '../models/Tenant';
import { Payment } from '../models/Payment';
import { Lead } from '../models/Lead';
import { Package } from '../models/Package';
import { Invoice } from '../models/Invoice';
import { Coupon } from '../models/Coupon';

function toINR(amount: number, currency: 'INR' | 'USD'): number {
  if (currency === 'USD') {
    const rate = parseFloat(process.env.USD_TO_INR_RATE || '83.5');
    return amount * rate;
  }
  return amount;
}

export const getReportsSummary = async (_req: AuthRequest, res: Response) => {
  try {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const rangeStart = new Date();
    rangeStart.setMonth(rangeStart.getMonth() - 11);
    rangeStart.setDate(1);
    rangeStart.setHours(0, 0, 0, 0);

    const payments = await Payment.find({ paidAt: { $gte: rangeStart } }).lean();
    const revenueByMonth: { name: string; setupFee: number; subscription: number; aiCreditTopup: number; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const y = d.getFullYear();
      const m = d.getMonth();
      const monthPayments = payments.filter((p: any) => {
        const pd = new Date(p.paidAt);
        return pd.getFullYear() === y && pd.getMonth() === m;
      });
      const setupFee = monthPayments.filter((p: any) => p.type === 'SETUP_FEE').reduce((s: number, p: any) => s + toINR(p.amount, p.currency), 0);
      const subscription = monthPayments.filter((p: any) => p.type === 'SUBSCRIPTION').reduce((s: number, p: any) => s + toINR(p.amount, p.currency), 0);
      const aiCreditTopup = monthPayments.filter((p: any) => p.type === 'AI_CREDIT_TOPUP').reduce((s: number, p: any) => s + toINR(p.amount, p.currency), 0);
      revenueByMonth.push({ name: `${monthNames[m]} ${String(y).slice(2)}`, setupFee, subscription, aiCreditTopup, total: setupFee + subscription + aiCreditTopup });
    }

    const tenants = await Tenant.find().populate('packageId', 'name features').lean();

    const packageCounts = new Map<string, number>();
    const moduleCounts = new Map<string, number>();
    let activeCount = 0;
    const subscriptionStatusCounts: Record<string, number> = { ACTIVE: 0, PENDING: 0, PAST_DUE: 0, CANCELLED: 0 };

    for (const t of tenants as any[]) {
      const pkgName = t.packageId?.name || 'Custom';
      packageCounts.set(pkgName, (packageCounts.get(pkgName) || 0) + 1);
      if (t.isActive) activeCount += 1;
      if (t.subscriptionStatus) subscriptionStatusCounts[t.subscriptionStatus] = (subscriptionStatusCounts[t.subscriptionStatus] || 0) + 1;
      for (const feature of t.packageId?.features || []) {
        moduleCounts.set(feature, (moduleCounts.get(feature) || 0) + 1);
      }
    }

    const packageDistribution = Array.from(packageCounts.entries()).map(([name, count]) => ({ name, count }));
    const moduleAdoption = Array.from(moduleCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const leadAgg = await Lead.aggregate([
      { $group: { _id: '$stage', count: { $sum: 1 }, value: { $sum: '$estimatedValue' } } },
    ]);
    const stages = ['LEAD', 'DEMO_SCHEDULED', 'PROPOSAL_SENT', 'QUOTATION_APPROVED', 'WON', 'LOST'];
    const leadFunnel = stages.map((stage) => {
      const match = leadAgg.find((a: any) => a._id === stage);
      return { stage, count: match?.count || 0, value: match?.value || 0 };
    });

    const totalPackages = await Package.countDocuments();

    const invoiceAgg = await Invoice.aggregate([
      { $group: { _id: null, totalTax: { $sum: '$taxAmount' }, totalDiscount: { $sum: '$discountAmount' }, totalInvoiced: { $sum: '$totalAmount' }, totalCollected: { $sum: '$amountPaid' } } },
    ]);
    const billingTotals = invoiceAgg[0] || { totalTax: 0, totalDiscount: 0, totalInvoiced: 0, totalCollected: 0 };
    const [activeCouponCount, totalCouponRedemptions] = await Promise.all([
      Coupon.countDocuments({ isActive: true }),
      Coupon.aggregate([{ $group: { _id: null, total: { $sum: '$redeemedCount' } } }]).then((r) => r[0]?.total || 0),
    ]);

    res.status(200).json({
      revenueByMonth,
      packageDistribution,
      moduleAdoption,
      leadFunnel,
      companyStatusBreakdown: { active: activeCount, inactive: tenants.length - activeCount },
      subscriptionStatusCounts,
      totalCompanies: tenants.length,
      totalPackages,
      totalTaxCollected: billingTotals.totalTax,
      totalDiscountGiven: billingTotals.totalDiscount,
      totalInvoiced: billingTotals.totalInvoiced,
      totalCollected: billingTotals.totalCollected,
      activeCouponCount,
      totalCouponRedemptions,
    });
  } catch (error) {
    console.error('Error building reports summary:', error);
    res.status(500).json({ message: 'Internal server error while building reports summary' });
  }
};

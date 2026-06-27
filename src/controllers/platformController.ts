import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { Package } from '../models/Package';
import { FeatureFlag } from '../models/FeatureFlag';
import { Payment } from '../models/Payment';
import { AuditLog } from '../models/AuditLog';
import { Ticket } from '../models/Ticket';
import mongoose from 'mongoose';

function toINR(amount: number, currency: 'INR' | 'USD'): number {
  if (currency === 'USD') {
    const rate = parseFloat(process.env.USD_TO_INR_RATE || '83.5');
    return amount * rate;
  }
  return amount;
}

function resolveRange(req: AuthRequest): { start: Date; end: Date } {
  const range = (req.query.range as string) || 'today';
  const now = new Date();
  if (range === 'custom' && req.query.from && req.query.to) {
    const start = new Date(req.query.from as string);
    start.setHours(0, 0, 0, 0);
    const end = new Date(req.query.to as string);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (range === 'week') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  if (range === 'month') {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { start, end: now };
}

export const getPlatformDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const { start, end } = resolveRange(req);

    const [tenants, totalPackages, totalFeatures, totalUsers] = await Promise.all([
      Tenant.find().populate('packageId', 'name').sort({ createdAt: -1 }).lean(),
      Package.countDocuments(),
      FeatureFlag.countDocuments(),
      User.countDocuments({ tenantId: { $ne: 'SUPER_ADMIN' } }).setOptions({ bypassTenantIsolation: true }),
    ]);

    const totalTenants = tenants.length;
    const activeTenants = tenants.filter((t: any) => t.isActive).length;

    const payments = await Payment.find({ paidAt: { $gte: start, $lte: end } }).lean();
    const sumByType = (type: string) => payments.filter((p: any) => p.type === type).reduce((s: number, p: any) => s + toINR(p.amount, p.currency), 0);
    const setupFeeRevenueINR = sumByType('SETUP_FEE');
    const subscriptionRevenueINR = sumByType('SUBSCRIPTION');
    const aiCreditRevenueINR = sumByType('AI_CREDIT_TOPUP');
    const revenueINR = setupFeeRevenueINR + subscriptionRevenueINR + aiCreditRevenueINR;

    const newCompaniesInRange = tenants.filter((t: any) => t.createdAt >= start && t.createdAt <= end).length;

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const growth: { name: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const y = d.getFullYear();
      const m = d.getMonth();
      const count = tenants.filter((t: any) => {
        const cd = new Date(t.createdAt);
        return cd.getFullYear() === y && cd.getMonth() === m;
      }).length;
      growth.push({ name: `${monthNames[m]} ${String(y).slice(2)}`, value: count });
    }

    const paymentAlerts: any[] = [];
    const now = new Date();
    for (const t of tenants as any[]) {
      if (!t.isActive) continue;
      if (t.setupFeeStatus === 'PENDING' && (t.setupFeeAmount || 0) > 0) {
        paymentAlerts.push({ tenantId: String(t._id), companyName: t.name, type: 'SETUP_FEE_PENDING', amount: t.setupFeeAmount, currency: t.setupFeeCurrency || 'INR' });
      } else if (t.subscriptionStatus === 'PAST_DUE') {
        paymentAlerts.push({ tenantId: String(t._id), companyName: t.name, type: 'SUBSCRIPTION_PAST_DUE', amount: t.subscriptionAmount, currency: t.subscriptionCurrency || 'INR' });
      } else if (t.nextRenewalDate && new Date(t.nextRenewalDate) < now && t.subscriptionStatus === 'ACTIVE') {
        paymentAlerts.push({ tenantId: String(t._id), companyName: t.name, type: 'RENEWAL_OVERDUE', amount: t.subscriptionAmount, currency: t.subscriptionCurrency || 'INR', nextRenewalDate: t.nextRenewalDate });
      }
    }

    const recentAuditEvents = await AuditLog.find({ createdAt: { $gte: start, $lte: end } })
      .setOptions({ bypassTenantIsolation: true })
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(15)
      .lean();

    const activityCountInRange = await AuditLog.countDocuments({ createdAt: { $gte: start, $lte: end } }).setOptions({ bypassTenantIsolation: true });

    res.status(200).json({
      range: (req.query.range as string) || 'today',
      totalTenants,
      activeTenants,
      totalPackages,
      totalFeatures,
      totalUsers,
      growth,
      recentTenants: tenants.slice(0, 8),
      recentAuditEvents,
      revenueINR,
      setupFeeRevenueINR,
      subscriptionRevenueINR,
      aiCreditRevenueINR,
      newCompaniesInRange,
      activityCountInRange,
      paymentAlerts,
    });
  } catch (error) {
    console.error('Error building platform dashboard stats:', error);
    res.status(500).json({ message: 'Internal server error while building dashboard stats' });
  }
};

export const getPlatformAuditLogs = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const query: any = {};
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

    const tenantIds = Array.from(new Set(logs.map((l: any) => l.tenantId).filter((id: string) => mongoose.Types.ObjectId.isValid(id))));
    const tenants = tenantIds.length ? await Tenant.find({ _id: { $in: tenantIds } }).select('name').lean() : [];
    const tenantNameById = new Map(tenants.map((t: any) => [String(t._id), t.name]));

    const data = logs.map((l: any) => ({
      ...l,
      tenantName: tenantNameById.get(String(l.tenantId)) || (l.tenantId === 'SUPER_ADMIN' ? 'Platform' : l.tenantId === 'system' ? 'System' : 'Unknown'),
    }));

    res.status(200).json({ data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Error fetching platform audit logs:', error);
    res.status(500).json({ message: 'Internal server error while fetching audit logs' });
  }
};

export const getPlatformTickets = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (req.query.status) query.status = req.query.status;
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
      Ticket.countDocuments({ status: { $in: ['Open', 'In_Progress'] }, priority: 'Urgent' }).setOptions({ bypassTenantIsolation: true }),
    ]);

    res.status(200).json({ data: tickets, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }, openCount, urgentCount });
  } catch (error) {
    console.error('Error fetching platform tickets:', error);
    res.status(500).json({ message: 'Internal server error while fetching tickets' });
  }
};

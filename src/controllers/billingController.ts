import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Tenant } from '../models/Tenant';
import { Company } from '../models/Company';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { Quotation } from '../models/Quotation';
import { Invoice, INVOICE_STATUSES } from '../models/Invoice';
import { Payment } from '../models/Payment';
import { AuditLog } from '../models/AuditLog';
import { generateQuotationNumber, generateInvoiceNumber, buildQuotationPdf, buildInvoicePdf } from '../services/billingDocuments';
import { createRazorpayOrder, createStripeCheckoutSession } from '../services/paymentGateways';
import { resolveCouponDiscount } from '../controllers/couponController';
import { Coupon } from '../models/Coupon';
import { sendMail } from '../services/mailer';
import { z } from 'zod';

const DEFAULT_INDIA_GST_RATE = 18;

export async function resolveCompanyContactEmail(tenantId: string): Promise<string | null> {
  const adminRole = await Role.findOne({ tenantId, name: 'Company Admin' }).lean();
  if (adminRole) {
    const admin = await User.findOne({ tenantId, roleId: adminRole._id }).select('email').lean();
    if (admin?.email) return admin.email;
  }
  const company = await Company.findOne({ tenantId }).select('pendingAdminEmail email').lean();
  return company?.pendingAdminEmail || company?.email || null;
}

async function writeBillingAudit(tenantId: string, userId: any, action: string, details: Record<string, any>) {
  await AuditLog.create({ tenantId, userId, action, module: 'Billing', status: 'SUCCESS', details } as any);
}

function computeNextRenewalDate(from: Date, billingCycle: 'MONTHLY' | 'YEARLY'): Date {
  const next = new Date(from);
  if (billingCycle === 'YEARLY') next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Single choke point for "money landed against this invoice" — used by both the manual
 * status-override endpoint and the Razorpay/Stripe webhook handlers, so the Payment ledger,
 * Invoice status, and Tenant billing fields stay consistent regardless of how payment arrived.
 */
export async function applyInvoicePayment(params: {
  invoiceId: string;
  amountPaidNow: number;
  gateway: 'RAZORPAY' | 'STRIPE' | 'MANUAL';
  gatewayPaymentId?: string;
  recordedBy?: any;
  notes?: string;
}) {
  const invoice = await Invoice.findById(params.invoiceId);
  if (!invoice) throw new Error('Invoice not found');

  invoice.amountPaid = (invoice.amountPaid || 0) + params.amountPaidNow;
  invoice.status = invoice.amountPaid >= invoice.totalAmount ? 'PAID' : invoice.amountPaid > 0 ? 'PARTIAL' : 'PENDING';
  invoice.gateway = params.gateway;
  if (params.gatewayPaymentId) invoice.gatewayPaymentId = params.gatewayPaymentId;
  if (invoice.status === 'PAID') invoice.paidAt = new Date();
  await invoice.save();

  await Payment.create({
    tenantId: invoice.tenantId,
    invoiceId: invoice._id,
    type: invoice.type,
    amount: params.amountPaidNow,
    currency: invoice.currency,
    paidAt: new Date(),
    gateway: params.gateway,
    gatewayPaymentId: params.gatewayPaymentId,
    notes: params.notes,
    ...(params.recordedBy && { recordedBy: params.recordedBy }),
  });

  if (invoice.status === 'PAID') {
    const tenant = await Tenant.findById(invoice.tenantId);
    if (tenant) {
      if (invoice.type === 'SETUP_FEE') {
        tenant.setupFeeStatus = 'PAID';
        tenant.setupFeePaidAt = new Date();
      } else {
        tenant.subscriptionStatus = 'ACTIVE';
        tenant.nextRenewalDate = computeNextRenewalDate(new Date(), tenant.billingCycle);
      }
      await tenant.save();
    }
  }

  await writeBillingAudit(String(invoice.tenantId), params.recordedBy, 'INVOICE_PAYMENT_RECEIVED', {
    invoiceNumber: invoice.invoiceNumber, amountPaidNow: params.amountPaidNow, gateway: params.gateway, status: invoice.status,
  });

  return invoice;
}

// ---- Quotations ----

export const generateQuotation = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.params.id as string;
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    const items = [
      { description: 'One-Time Setup Fee', amount: tenant.setupFeeAmount || 0 },
      { description: `Subscription (${tenant.billingCycle === 'YEARLY' ? 'Annual' : 'Monthly'}, ${tenant.userLimit || 0} users)`, amount: tenant.subscriptionAmount || 0 },
    ];
    const totalAmount = items.reduce((s, i) => s + i.amount, 0);
    const quotationNumber = await generateQuotationNumber();
    const validUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const pdfUrl = await buildQuotationPdf({
      quotationNumber, companyName: tenant.name, items, totalAmount, currency: 'INR', validUntil,
    });

    const quotation = await Quotation.create({
      tenantId: tenant._id,
      quotationNumber,
      items,
      totalAmount,
      currency: 'INR',
      status: 'DRAFT',
      validUntil,
      pdfUrl,
      ...(req.user?._id && { createdBy: req.user._id }),
    });

    await writeBillingAudit(tenantId, req.user?._id, 'GENERATE_QUOTATION', { quotationNumber, totalAmount });
    res.status(201).json(quotation);
  } catch (error) {
    console.error('Error generating quotation:', error);
    res.status(500).json({ message: 'Internal server error while generating quotation' });
  }
};

export const listQuotations = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.params.id as string;
    const quotations = await Quotation.find({ tenantId }).sort({ createdAt: -1 }).lean();
    res.status(200).json(quotations);
  } catch (error) {
    console.error('Error listing quotations:', error);
    res.status(500).json({ message: 'Internal server error while listing quotations' });
  }
};

export const sendQuotation = async (req: AuthRequest, res: Response) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
    const tenant = await Tenant.findById(quotation.tenantId);
    const email = await resolveCompanyContactEmail(String(quotation.tenantId));
    if (!email) return res.status(400).json({ message: 'No contact email found for this company' });

    const result = await sendMail({
      to: email,
      subject: `Quotation ${quotation.quotationNumber} from CrewCam HR Cloud`,
      html: `<p>Hi,</p><p>Please find your quotation <strong>${quotation.quotationNumber}</strong> from CrewCam HR Cloud.</p><p><a href="${quotation.pdfUrl}">Download Quotation PDF</a></p>`,
    });

    quotation.status = 'SENT';
    quotation.sentAt = new Date();
    await quotation.save();

    await writeBillingAudit(String(quotation.tenantId), req.user?._id, 'SEND_QUOTATION', { quotationNumber: quotation.quotationNumber, emailSent: result.sent, email });
    res.status(200).json({ quotation, emailSent: result.sent, emailError: result.error });
  } catch (error) {
    console.error('Error sending quotation:', error);
    res.status(500).json({ message: 'Internal server error while sending quotation' });
  }
};

// ---- Invoices ----

const generateInvoiceSchema = z.object({
  type: z.enum(['SETUP_FEE', 'SUBSCRIPTION']),
  couponCode: z.string().trim().optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
});

export const generateInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = generateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'A valid invoice type is required' });

    const tenantId = req.params.id as string;
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    const amount = parsed.data.type === 'SETUP_FEE' ? (tenant.setupFeeAmount || 0) : (tenant.subscriptionAmount || 0);

    let discountAmount = 0;
    let appliedCouponCode: string | undefined;
    if (parsed.data.couponCode) {
      const result = await resolveCouponDiscount(parsed.data.couponCode, parsed.data.type, amount);
      if ('error' in result) return res.status(400).json({ message: result.error });
      discountAmount = result.discountAmount;
      appliedCouponCode = result.coupon.code;
    }

    let taxRate = parsed.data.taxRate;
    if (taxRate === undefined) {
      const company = await Company.findOne({ tenantId }).select('country').lean();
      taxRate = company?.country === 'India' ? DEFAULT_INDIA_GST_RATE : 0;
    }

    const taxableAmount = Math.max(0, amount - discountAmount);
    const taxAmount = Math.round((taxableAmount * taxRate) / 100);
    const totalAmount = taxableAmount + taxAmount;

    const invoiceNumber = await generateInvoiceNumber();
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const pdfUrl = await buildInvoicePdf({
      invoiceNumber, companyName: tenant.name, type: parsed.data.type,
      amount, discountAmount, taxRate, taxAmount, totalAmount,
      amountPaid: 0, currency: 'INR', status: 'PENDING', dueDate,
    });

    const invoice = await Invoice.create({
      tenantId: tenant._id,
      invoiceNumber,
      type: parsed.data.type,
      amount,
      ...(appliedCouponCode && { couponCode: appliedCouponCode }),
      discountAmount,
      taxRate,
      taxAmount,
      totalAmount,
      currency: 'INR',
      status: 'PENDING',
      dueDate,
      pdfUrl,
      ...(req.user?._id && { createdBy: req.user._id }),
    });

    if (appliedCouponCode) {
      await Coupon.updateOne({ code: appliedCouponCode }, { $inc: { redeemedCount: 1 } });
    }

    await writeBillingAudit(tenantId, req.user?._id, 'GENERATE_INVOICE', { invoiceNumber, type: parsed.data.type, amount, discountAmount, taxAmount, totalAmount, couponCode: appliedCouponCode });
    res.status(201).json(invoice);
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ message: 'Internal server error while generating invoice' });
  }
};

export const listInvoicesForTenant = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.params.id as string;
    const invoices = await Invoice.find({ tenantId }).sort({ createdAt: -1 }).lean();
    res.status(200).json(invoices);
  } catch (error) {
    console.error('Error listing invoices:', error);
    res.status(500).json({ message: 'Internal server error while listing invoices' });
  }
};

export const listAllInvoices = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.type) query.type = req.query.type;
    if (req.query.tenantId) query.tenantId = req.query.tenantId;

    const [invoices, total] = await Promise.all([
      Invoice.find(query).populate('tenantId', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Invoice.countDocuments(query),
    ]);

    res.status(200).json({ data: invoices, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Error listing invoices:', error);
    res.status(500).json({ message: 'Internal server error while listing invoices' });
  }
};

export const listAllPayments = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (req.query.type) query.type = req.query.type;
    if (req.query.tenantId) query.tenantId = req.query.tenantId;
    if (req.query.from || req.query.to) {
      query.paidAt = {};
      if (req.query.from) query.paidAt.$gte = new Date(req.query.from as string);
      if (req.query.to) query.paidAt.$lte = new Date(req.query.to as string);
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

    res.status(200).json({ data: payments, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Error listing payments:', error);
    res.status(500).json({ message: 'Internal server error while listing payments' });
  }
};

export const sendInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    const tenant = await Tenant.findById(invoice.tenantId);
    const email = await resolveCompanyContactEmail(String(invoice.tenantId));
    if (!email) return res.status(400).json({ message: 'No contact email found for this company' });

    const result = await sendMail({
      to: email,
      subject: `Invoice ${invoice.invoiceNumber} from CrewCam HR Cloud`,
      html: `<p>Hi,</p><p>Please find your invoice <strong>${invoice.invoiceNumber}</strong> (${tenant?.name || ''}).</p><p><a href="${invoice.pdfUrl}">Download Invoice PDF</a></p>`,
    });

    await writeBillingAudit(String(invoice.tenantId), req.user?._id, 'SEND_INVOICE', { invoiceNumber: invoice.invoiceNumber, emailSent: result.sent, email });
    res.status(200).json({ emailSent: result.sent, emailError: result.error });
  } catch (error) {
    console.error('Error sending invoice:', error);
    res.status(500).json({ message: 'Internal server error while sending invoice' });
  }
};

const checkoutSchema = z.object({ gateway: z.enum(['RAZORPAY', 'STRIPE']) });

export const createCheckoutSession = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'A valid gateway is required' });

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    if (invoice.status === 'PAID') return res.status(400).json({ message: 'Invoice is already paid' });

    const remaining = invoice.totalAmount - (invoice.amountPaid || 0);

    if (parsed.data.gateway === 'RAZORPAY') {
      const order = await createRazorpayOrder({ amount: remaining, currency: invoice.currency, receipt: invoice.invoiceNumber });
      if (!order.configured) return res.status(503).json({ message: 'Razorpay is not configured on the server (missing RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET).' });
      invoice.gateway = 'RAZORPAY';
      invoice.gatewayOrderId = order.orderId;
      await invoice.save();
      return res.status(200).json({ gateway: 'RAZORPAY', orderId: order.orderId, keyId: order.keyId, amount: order.amount, currency: order.currency, invoiceId: invoice._id });
    }

    const frontendUrl = process.env.FRONTEND_LOGIN_URL?.replace('/login', '') || 'http://localhost:3000';
    const session = await createStripeCheckoutSession({
      amount: remaining,
      currency: invoice.currency,
      description: `${invoice.type === 'SETUP_FEE' ? 'Setup Fee' : 'Subscription'} — Invoice ${invoice.invoiceNumber}`,
      invoiceId: String(invoice._id),
      successUrl: `${frontendUrl}/super-admin/invoices?checkout=success`,
      cancelUrl: `${frontendUrl}/super-admin/invoices?checkout=cancelled`,
    });
    if (!session.configured) return res.status(503).json({ message: 'Stripe is not configured on the server (missing STRIPE_SECRET_KEY).' });
    invoice.gateway = 'STRIPE';
    invoice.gatewayOrderId = session.sessionId;
    await invoice.save();
    res.status(200).json({ gateway: 'STRIPE', url: session.url, invoiceId: invoice._id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ message: 'Internal server error while creating checkout session' });
  }
};

const statusOverrideSchema = z.object({ status: z.enum(INVOICE_STATUSES), note: z.string().optional() });

export const setInvoiceStatus = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = statusOverrideSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'A valid status is required' });

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const fromStatus = invoice.status;

    if (parsed.data.status === 'PAID') {
      const remaining = invoice.totalAmount - (invoice.amountPaid || 0);
      if (remaining > 0) {
        await applyInvoicePayment({
          invoiceId: String(invoice._id),
          amountPaidNow: remaining,
          gateway: 'MANUAL',
          notes: parsed.data.note || 'Marked paid manually by Super Admin',
          recordedBy: req.user?._id,
        });
      }
    } else {
      invoice.status = parsed.data.status;
      await invoice.save();
      await writeBillingAudit(String(invoice.tenantId), req.user?._id, 'INVOICE_STATUS_CHANGE', { invoiceNumber: invoice.invoiceNumber, fromStatus, toStatus: invoice.status, note: parsed.data.note });
    }

    const updated = await Invoice.findById(invoice._id);
    res.status(200).json(updated);
  } catch (error) {
    console.error('Error setting invoice status:', error);
    res.status(500).json({ message: 'Internal server error while setting invoice status' });
  }
};

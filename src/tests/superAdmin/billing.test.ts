import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, clearTestDB, createSuperAdmin, createRestrictedUser, authHeader } from '../testUtils/setup';
import { Package } from '../../models/Package';
import { Tenant } from '../../models/Tenant';
import { Role } from '../../models/Role';
import { User } from '../../models/User';
import { Quotation } from '../../models/Quotation';
import { Invoice } from '../../models/Invoice';
import { Payment } from '../../models/Payment';

async function createTenantWithAdmin(adminEmail = 'admin@acme.test') {
  const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
  const tenant = await new Tenant({ name: 'Acme', packageId: pkg._id, setupFeeAmount: 5000, subscriptionAmount: 2000 }).save();
  const role = await new Role({ name: 'Company Admin', permissions: ['*'], category: 'company_admin', tenantId: String(tenant._id) }).save();
  await new User({
    email: adminEmail, passwordHash: 'x', firstName: 'Jane', lastName: 'Doe',
    roleId: role._id, tenantId: String(tenant._id),
  }).save();
  return { tenant, role };
}

test('super-admin billing endpoints', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('rejects requests with no auth token', async () => {
    const res = await request(app).get('/api/v1/super-admin/invoices');
    assert.equal(res.status, 401);
  });

  await t.test('rejects a non-super-admin role', async () => {
    const { token } = await createRestrictedUser([]);
    const res = await request(app)
      .get('/api/v1/super-admin/invoices')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 403);
  });

  // ---- Quotations ----
  // generateQuotation/generateInvoice call buildQuotationPdf/buildInvoicePdf -> savePdfToCloudinary,
  // which performs a real upload against whatever Cloudinary account is configured in the
  // environment (this repo's .env has live Cloudinary credentials injected into the test
  // process). We avoid exercising those success paths in automated tests and only cover their
  // validation/404 branches, building Quotation/Invoice fixtures directly via the model instead.

  await t.test('returns 404 generating a quotation for a non-existent tenant', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/tenants/507f1f77bcf86cd799439099/quotations')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 404);
  });

  await t.test('lists quotations for a tenant', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();
    await Quotation.create({
      tenantId: tenant._id, quotationNumber: 'QTN-2026-0001', items: [{ description: 'Setup', amount: 100 }], totalAmount: 100,
    } as any);

    const res = await request(app)
      .get(`/api/v1/super-admin/tenants/${tenant._id}/quotations`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].quotationNumber, 'QTN-2026-0001');
  });

  await t.test('returns 404 sending a non-existent quotation', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/quotations/507f1f77bcf86cd799439099/send')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 404);
  });

  await t.test('rejects sending a quotation when no contact email exists for the tenant', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'NoContact', packageId: pkg._id }).save();
    const quotation = await Quotation.create({
      tenantId: tenant._id, quotationNumber: 'QTN-2026-0002', items: [{ description: 'Setup', amount: 100 }], totalAmount: 100,
    } as any);

    const res = await request(app)
      .post(`/api/v1/super-admin/quotations/${quotation._id}/send`)
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 400);
  });

  await t.test('sends a quotation (no SMTP configured in test env)', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin('quote-contact@acme.test');
    const quotation = await Quotation.create({
      tenantId: tenant._id, quotationNumber: 'QTN-2026-0003', items: [{ description: 'Setup', amount: 100 }], totalAmount: 100, pdfUrl: 'https://example.test/q.pdf',
    } as any);

    const res = await request(app)
      .post(`/api/v1/super-admin/quotations/${quotation._id}/send`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.emailSent, false);
    assert.equal(res.body.quotation.status, 'SENT');
  });

  // ---- Invoices ----

  await t.test('rejects generating an invoice with an invalid type', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();
    const res = await request(app)
      .post(`/api/v1/super-admin/tenants/${tenant._id}/invoices`)
      .set('Authorization', authHeader(token))
      .send({ type: 'NOT_REAL' });
    assert.equal(res.status, 400);
  });

  await t.test('returns 404 generating an invoice for a non-existent tenant', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/tenants/507f1f77bcf86cd799439099/invoices')
      .set('Authorization', authHeader(token))
      .send({ type: 'SETUP_FEE' });
    assert.equal(res.status, 404);
  });

  await t.test('lists invoices for a tenant', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();
    await Invoice.create({
      tenantId: tenant._id, invoiceNumber: 'INV-2026-0001', type: 'SETUP_FEE', amount: 5000, totalAmount: 5000,
    } as any);

    const res = await request(app)
      .get(`/api/v1/super-admin/tenants/${tenant._id}/invoices`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].invoiceNumber, 'INV-2026-0001');
  });

  await t.test('lists all invoices with pagination and tenant name populated', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();
    await Invoice.create({
      tenantId: tenant._id, invoiceNumber: 'INV-2026-0002', type: 'SETUP_FEE', amount: 5000, totalAmount: 5000,
    } as any);

    const res = await request(app)
      .get('/api/v1/super-admin/invoices')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].tenantId.name, 'Acme');
    assert.equal(res.body.pagination.total, 1);
  });

  await t.test('returns 404 sending a non-existent invoice', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/invoices/507f1f77bcf86cd799439099/send')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 404);
  });

  await t.test('sends an invoice (no SMTP configured in test env)', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin('invoice-contact@acme.test');
    const invoice = await Invoice.create({
      tenantId: tenant._id, invoiceNumber: 'INV-2026-0003', type: 'SETUP_FEE', amount: 5000, totalAmount: 5000, pdfUrl: 'https://example.test/i.pdf',
    } as any);

    const res = await request(app)
      .post(`/api/v1/super-admin/invoices/${invoice._id}/send`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.emailSent, false);
  });

  // ---- Checkout session ----
  // Razorpay/Stripe are not configured in the test environment, so createCheckoutSession's
  // "not configured" (503) branch is exercised for real here — this is the actual production
  // behavior when no payment gateway keys are set, not a stub.

  await t.test('rejects checkout session creation with an invalid gateway', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();
    const invoice = await Invoice.create({
      tenantId: tenant._id, invoiceNumber: 'INV-2026-0004', type: 'SETUP_FEE', amount: 5000, totalAmount: 5000,
    } as any);

    const res = await request(app)
      .post(`/api/v1/super-admin/invoices/${invoice._id}/checkout-session`)
      .set('Authorization', authHeader(token))
      .send({ gateway: 'NOT_REAL' });
    assert.equal(res.status, 400);
  });

  await t.test('returns 404 creating a checkout session for a non-existent invoice', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/invoices/507f1f77bcf86cd799439099/checkout-session')
      .set('Authorization', authHeader(token))
      .send({ gateway: 'RAZORPAY' });
    assert.equal(res.status, 404);
  });

  await t.test('rejects creating a checkout session for an already-paid invoice', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();
    const invoice = await Invoice.create({
      tenantId: tenant._id, invoiceNumber: 'INV-2026-0005', type: 'SETUP_FEE', amount: 5000, totalAmount: 5000, status: 'PAID',
    } as any);

    const res = await request(app)
      .post(`/api/v1/super-admin/invoices/${invoice._id}/checkout-session`)
      .set('Authorization', authHeader(token))
      .send({ gateway: 'RAZORPAY' });
    assert.equal(res.status, 400);
  });

  await t.test('returns 503 when Razorpay is not configured', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();
    const invoice = await Invoice.create({
      tenantId: tenant._id, invoiceNumber: 'INV-2026-0006', type: 'SETUP_FEE', amount: 5000, totalAmount: 5000,
    } as any);

    const res = await request(app)
      .post(`/api/v1/super-admin/invoices/${invoice._id}/checkout-session`)
      .set('Authorization', authHeader(token))
      .send({ gateway: 'RAZORPAY' });
    assert.equal(res.status, 503);
  });

  await t.test('returns 503 when Stripe is not configured', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();
    const invoice = await Invoice.create({
      tenantId: tenant._id, invoiceNumber: 'INV-2026-0007', type: 'SETUP_FEE', amount: 5000, totalAmount: 5000,
    } as any);

    const res = await request(app)
      .post(`/api/v1/super-admin/invoices/${invoice._id}/checkout-session`)
      .set('Authorization', authHeader(token))
      .send({ gateway: 'STRIPE' });
    assert.equal(res.status, 503);
  });

  // ---- Set invoice status ----

  await t.test('rejects setting an invalid invoice status', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();
    const invoice = await Invoice.create({
      tenantId: tenant._id, invoiceNumber: 'INV-2026-0008', type: 'SETUP_FEE', amount: 5000, totalAmount: 5000,
    } as any);

    const res = await request(app)
      .put(`/api/v1/super-admin/invoices/${invoice._id}/status`)
      .set('Authorization', authHeader(token))
      .send({ status: 'NOT_REAL' });
    assert.equal(res.status, 400);
  });

  await t.test('returns 404 setting status for a non-existent invoice', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .put('/api/v1/super-admin/invoices/507f1f77bcf86cd799439099/status')
      .set('Authorization', authHeader(token))
      .send({ status: 'CANCELLED' });
    assert.equal(res.status, 404);
  });

  await t.test('marks an invoice PAID and applies the payment to the tenant', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();
    const invoice = await Invoice.create({
      tenantId: tenant._id, invoiceNumber: 'INV-2026-0009', type: 'SETUP_FEE', amount: 5000, totalAmount: 5000,
    } as any);

    const res = await request(app)
      .put(`/api/v1/super-admin/invoices/${invoice._id}/status`)
      .set('Authorization', authHeader(token))
      .send({ status: 'PAID' });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'PAID');
    assert.equal(res.body.amountPaid, 5000);

    const updatedTenant = await Tenant.findById(tenant._id);
    assert.equal(updatedTenant?.setupFeeStatus, 'PAID');

    const payments = await Payment.find({ tenantId: tenant._id });
    assert.equal(payments.length, 1);
  });

  await t.test('overrides an invoice status without payment for non-PAID statuses', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();
    const invoice = await Invoice.create({
      tenantId: tenant._id, invoiceNumber: 'INV-2026-0010', type: 'SETUP_FEE', amount: 5000, totalAmount: 5000,
    } as any);

    const res = await request(app)
      .put(`/api/v1/super-admin/invoices/${invoice._id}/status`)
      .set('Authorization', authHeader(token))
      .send({ status: 'CANCELLED', note: 'Customer backed out' });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'CANCELLED');

    const payments = await Payment.find({ tenantId: tenant._id });
    assert.equal(payments.length, 0);
  });

  // ---- Payments ----

  await t.test('lists all payments with pagination', async () => {
    const { token } = await createSuperAdmin();
    const { tenant } = await createTenantWithAdmin();
    await Payment.create({
      tenantId: tenant._id, type: 'SETUP_FEE', amount: 5000, currency: 'INR', paidAt: new Date(), gateway: 'MANUAL',
    } as any);

    const res = await request(app)
      .get('/api/v1/super-admin/payments')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.pagination.total, 1);
  });
});

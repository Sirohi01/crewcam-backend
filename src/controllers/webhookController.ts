import { Request, Response } from 'express';
import { Invoice } from '../models/Invoice';
import { verifyRazorpayWebhookSignature, constructStripeEvent } from '../services/paymentGateways';
import { applyInvoicePayment } from './billingController';

export const razorpayWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const rawBody = (req.body as Buffer).toString('utf8');

    if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
      return res.status(400).json({ message: 'Invalid webhook signature' });
    }

    const event = JSON.parse(rawBody);
    const payload = event?.payload?.payment?.entity;

    if (event.event === 'payment.captured' && payload) {
      const orderId = payload.order_id;
      const invoice = await Invoice.findOne({ gatewayOrderId: orderId });
      if (invoice && invoice.status !== 'PAID') {
        await applyInvoicePayment({
          invoiceId: String(invoice._id),
          amountPaidNow: payload.amount / 100,
          gateway: 'RAZORPAY',
          gatewayPaymentId: payload.id,
          notes: 'Razorpay webhook: payment.captured',
        });
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing Razorpay webhook:', error);
    // Per Razorpay/Stripe convention, still ack with 200 once signature is valid and we've
    // logged the failure server-side — returning an error here just triggers pointless retries.
    res.status(200).json({ received: true });
  }
};

export const stripeWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'] as string | undefined;
    const event = constructStripeEvent(req.body as Buffer, signature);
    if (!event) return res.status(400).json({ message: 'Invalid webhook signature' });

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const invoiceId = session.metadata?.invoiceId;
      if (invoiceId) {
        const invoice = await Invoice.findById(invoiceId);
        if (invoice && invoice.status !== 'PAID') {
          await applyInvoicePayment({
            invoiceId: String(invoice._id),
            amountPaidNow: (session.amount_total || 0) / 100,
            gateway: 'STRIPE',
            gatewayPaymentId: session.payment_intent,
            notes: 'Stripe webhook: checkout.session.completed',
          });
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing Stripe webhook:', error);
    res.status(200).json({ received: true });
  }
};

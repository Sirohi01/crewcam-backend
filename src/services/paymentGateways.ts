import crypto from 'crypto';
import Razorpay from 'razorpay';
import Stripe from 'stripe';

let razorpayClient: Razorpay | null = null;
let stripeClient: Stripe | null = null;

export function getRazorpayClient(): Razorpay | null {
  if (razorpayClient) return razorpayClient;
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return null;
  razorpayClient = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  return razorpayClient;
}

export function getStripeClient(): Stripe | null {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripeClient = new Stripe(key);
  return stripeClient;
}

export async function createRazorpayOrder(params: { amount: number; currency: 'INR' | 'USD'; receipt: string }) {
  const client = getRazorpayClient();
  if (!client) return { configured: false as const };
  const order = await client.orders.create({
    amount: Math.round(params.amount * 100), // paise/cents
    currency: params.currency,
    receipt: params.receipt,
  });
  return { configured: true as const, orderId: order.id, keyId: process.env.RAZORPAY_KEY_ID, amount: order.amount, currency: order.currency };
}

export async function createStripeCheckoutSession(params: {
  amount: number;
  currency: 'INR' | 'USD';
  description: string;
  invoiceId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const client = getStripeClient();
  if (!client) return { configured: false as const };
  const session = await client.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: params.currency.toLowerCase(),
        product_data: { name: params.description },
        unit_amount: Math.round(params.amount * 100),
      },
      quantity: 1,
    }],
    metadata: { invoiceId: params.invoiceId },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
  return { configured: true as const, sessionId: session.id, url: session.url };
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function constructStripeEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event | null {
  const client = getStripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!client || !secret || !signature) return null;
  try {
    return client.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    console.error('[stripe] webhook signature verification failed:', err);
    return null;
  }
}

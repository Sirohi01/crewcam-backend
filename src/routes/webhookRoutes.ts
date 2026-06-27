import { Router } from 'express';
import { razorpayWebhook, stripeWebhook } from '../controllers/webhookController';

// Mounted in server.ts with express.raw() BEFORE the global express.json() middleware —
// both Razorpay and Stripe signature verification need the exact raw request bytes.
const router = Router();
router.post('/razorpay', razorpayWebhook);
router.post('/stripe', stripeWebhook);

export default router;

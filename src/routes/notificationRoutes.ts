import express from 'express';
import { sendWhatsAppOTP, verifyWhatsAppOTP, sendWhatsAppMessage } from '../controllers/notificationController';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';

const router = express.Router();

// Declared explicitly rather than relying on the bare '/api/v1' router mounted before
// this one in app.ts — reordering app.ts must never make these routes public.
router.use(authenticate);
router.use(tenantResolver);

// OTP Routes
router.post('/otp/send', sendWhatsAppOTP);
router.post('/otp/verify', verifyWhatsAppOTP);

// Message Route
router.post('/whatsapp/send', sendWhatsAppMessage);

export default router;

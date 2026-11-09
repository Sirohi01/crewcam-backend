import express from 'express';
import { sendWhatsAppOTP, verifyWhatsAppOTP, sendWhatsAppMessage } from '../controllers/notificationController';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';

const router = express.Router();

// Declared explicitly rather than relying on the bare '/api/v1' router mounted before
// this one in app.ts — reordering app.ts must never make these routes public.
router.use(authenticate);
router.use(tenantResolver);

// OTP Routes
router.post('/otp/send', sendWhatsAppOTP);
router.post('/otp/verify', verifyWhatsAppOTP);

// Message Route
// Sends from the company's WhatsApp account: NOTIFICATION_SEND only (Company Admin/Admin by default).
router.post('/whatsapp/send', checkPermission('NOTIFICATION_SEND'), sendWhatsAppMessage);

export default router;

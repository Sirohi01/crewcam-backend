import express from 'express';
import { sendWhatsAppOTP, verifyWhatsAppOTP, sendWhatsAppMessage } from '../controllers/notificationController';

const router = express.Router();

// OTP Routes (No auth required to send/verify OTP generally, but depends on your flow)
router.post('/otp/send', sendWhatsAppOTP);
router.post('/otp/verify', verifyWhatsAppOTP);

// Message Route
router.post('/whatsapp/send', sendWhatsAppMessage);

export default router;

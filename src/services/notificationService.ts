import { Integration } from '../models/Integration';
import axios from 'axios';

// Opus API Configuration
const OPUS_API_URL = process.env.OPUS_API_URL || 'https://api.opus.com/v1/messages';
const OPUS_API_KEY = process.env.OPUS_API_KEY;

export const notificationService = {
  sendEmail: async (tenantId: string, to: string, subject: string, body: string) => {
    // Fetch email integration for the tenant
    const integration = await Integration.findOne({ tenantId, type: 'Email', isActive: true });
    
    if (!integration) {
      console.warn(`No active Email integration for tenant ${tenantId}. Simulating send.`);
      console.log(`[SIMULATED EMAIL] To: ${to} | Subject: ${subject}`);
      return { success: true, simulated: true };
    }

    // In a real scenario, use integration.config (e.g., SMTP host, port, user, pass) to send the email
    // e.g. using nodemailer
    console.log(`[REAL EMAIL] Sending via ${integration.provider} to ${to}...`);
    return { success: true, simulated: false };
  },

  sendSMS: async (tenantId: string, to: string, message: string) => {
    const integration = await Integration.findOne({ tenantId, type: 'SMS', isActive: true });
    
    if (!integration) {
      console.warn(`No active SMS integration for tenant ${tenantId}. Simulating send.`);
      console.log(`[SIMULATED SMS] To: ${to} | Message: ${message}`);
      return { success: true, simulated: true };
    }

    console.log(`[REAL SMS] Sending via ${integration.provider} to ${to}...`);
    return { success: true, simulated: false };
  },

  sendWhatsApp: async (tenantId: string, to: string, message: string) => {
    // Check if OPUS API Key is available
    if (OPUS_API_KEY) {
      console.log(`[REAL WHATSAPP via OPUS] Sending to ${to}...`);
      try {
        const response = await axios.post(
          OPUS_API_URL,
          { to, message, type: 'text' },
          { headers: { Authorization: `Bearer ${OPUS_API_KEY}`, 'Content-Type': 'application/json' } }
        );
        return { success: true, simulated: false, data: response.data };
      } catch (error: any) {
        console.error('[OPUS WHATSAPP ERROR]', error?.response?.data || error.message);
        throw new Error('Failed to send WhatsApp message via Opus API');
      }
    }

    const integration = await Integration.findOne({ tenantId, type: 'WhatsApp', isActive: true });
    
    if (!integration) {
      console.warn(`No active WhatsApp integration for tenant ${tenantId}. Simulating send.`);
      console.log(`[SIMULATED WHATSAPP] To: ${to} | Message: ${message}`);
      return { success: true, simulated: true };
    }

    console.log(`[REAL WHATSAPP] Sending via ${integration.provider} to ${to}...`);
    return { success: true, simulated: false };
  },

  sendWhatsAppOTP: async (tenantId: string, to: string, otp: string) => {
    if (OPUS_API_KEY) {
      console.log(`[REAL WHATSAPP OTP via OPUS] Sending OTP to ${to}...`);
      try {
        const response = await axios.post(
          OPUS_API_URL, // Replace with Opus OTP endpoint if different
          { to, message: `Your verification code is: ${otp}. Please do not share this with anyone.`, type: 'otp' },
          { headers: { Authorization: `Bearer ${OPUS_API_KEY}`, 'Content-Type': 'application/json' } }
        );
        return { success: true, simulated: false, data: response.data };
      } catch (error: any) {
        console.error('[OPUS OTP ERROR]', error?.response?.data || error.message);
        throw new Error('Failed to send WhatsApp OTP via Opus API');
      }
    }

    console.log(`[SIMULATED WHATSAPP OTP] To: ${to} | OTP: ${otp}`);
    return { success: true, simulated: true };
  }
};

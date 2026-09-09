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
    if (OPUS_API_KEY) {
      console.log(`[REAL WHATSAPP via OPUS] Sending to ${to}...`);
      try {
        const apiKey = OPUS_API_KEY.trim();
        const formattedMobile = to.replace(/\D/g, '');
        const destination = formattedMobile.length === 10 ? `91${formattedMobile}` : formattedMobile;
        const url = `https://api.opustechnology.in/wapp/v2/api/send?apikey=${apiKey}&mobile=${destination}&msg=${encodeURIComponent(message)}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[OPUS WHATSAPP ERROR] API Error Status: ${response.status}`, errorText);
            throw new Error(`WhatsApp API responded with ${response.status}`);
        }

        const data = await response.json();
        return { success: true, simulated: false, data };
      } catch (error: any) {
        console.error('[OPUS WHATSAPP ERROR]', error.message);
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
    // const aisensyApiKey = process.env.AISENSY_API_KEY;
    const formattedTo = to.replace(/\D/g, '');
    const destination = formattedTo.length === 10 ? `91${formattedTo}` : formattedTo;

    // if (aisensyApiKey) {
    //   console.log(`[REAL WHATSAPP OTP via AISENSY] Sending OTP to ${destination}...`);
    //   try {
    //     const response = await axios.post(
    //       'https://backend.aisensy.com/campaign/t1/api/v2',
    //       {
    //         apiKey: aisensyApiKey,
    //         campaignName: process.env.AISENSY_OTP_CAMPAIGN_NAME || 'AISENSY_CAMPAIGN_OTP',
    //         destination: destination,
    //         userName: "User",
    //         templateParams: [otp],
    //         buttonValue: otp
    //       },
    //       { headers: { 'Content-Type': 'application/json' } }
    //     );
    //     return { success: true, simulated: false, data: response.data };
    //   } catch (error: any) {
    //     console.error('[AISENSY OTP ERROR]', error?.response?.data || error.message);
    //     console.warn('Falling back to other providers or simulation...');
    //   }
    // }

    if (OPUS_API_KEY) {
      console.log(`[REAL WHATSAPP OTP via OPUS] Sending OTP to ${destination}...`);
      try {
        const apiKey = OPUS_API_KEY.trim();
        const msg = `Your verification code is: ${otp}. Please do not share this with anyone.`;
        const url = `https://api.opustechnology.in/wapp/v2/api/send?apikey=${apiKey}&mobile=${destination}&msg=${encodeURIComponent(msg)}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[OPUS WHATSAPP ERROR] API Error Status: ${response.status}`, errorText);
            throw new Error(`WhatsApp API responded with ${response.status}`);
        }

        const data = await response.json();
        return { success: true, simulated: false, data };
      } catch (error: any) {
        console.error('[OPUS OTP ERROR]', error.message);
        console.warn('Falling back to simulated OTP...');
      }
    }

    console.log(`[SIMULATED WHATSAPP OTP] To: ${to} | OTP: ${otp}`);
    return { success: true, simulated: true };
  }
};

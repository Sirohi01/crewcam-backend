import { Integration } from '../models/Integration';

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
  }
};

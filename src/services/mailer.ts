import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import nodemailer, { Transporter } from 'nodemailer';

// --- MICROSOFT GRAPH SETUP ---
let graphClient: Client | null = null;
function getGraphClient(): Client {
    if (graphClient) return graphClient;
    const tenantId = process.env.MS_TENANT_ID;
    const clientId = process.env.MS_CLIENT_ID;
    const clientSecret = process.env.MS_CLIENT_SECRET;
    if (!tenantId || !clientId || !clientSecret) {
        throw new Error('Microsoft Graph credentials not configured.');
    }
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const authProvider = new TokenCredentialAuthenticationProvider(credential, { scopes: ['https://graph.microsoft.com/.default'] });
    graphClient = Client.initWithMiddleware({ authProvider });
    return graphClient;
}

function toGraphAttachments(attachments: any[] = []) {
    return attachments.map(att => {
        const contentBytes = Buffer.isBuffer(att.content) ? att.content.toString('base64') : Buffer.from(att.content || '', att.encoding || 'utf8').toString('base64');
        const attachment: any = { '@odata.type': '#microsoft.graph.fileAttachment', name: att.filename, contentType: att.contentType || 'application/octet-stream', contentBytes };
        if (att.cid) { attachment.contentId = att.cid; attachment.isInline = true; }
        return attachment;
    });
}

// --- NODEMAILER SETUP ---
let transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true' || Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export interface SendMailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: any[];
}

export async function sendMail(input: SendMailInput): Promise<{ sent: boolean; error?: string }> {
  // Toggle: If USE_MS_GRAPH=true in .env, use Microsoft Graph. Otherwise use Nodemailer.
  const useGraph = process.env.USE_MS_GRAPH === 'true';

  if (useGraph) {
    try {
      const senderEmail = process.env.MS_SENDER_EMAIL;
      if (!senderEmail) return { sent: false, error: 'MS_SENDER_EMAIL is not configured.' };
      const client = getGraphClient();
      const recipients = Array.isArray(input.to)
          ? input.to.map(email => ({ emailAddress: { address: email.trim() } }))
          : input.to.split(',').map(email => ({ emailAddress: { address: email.trim() } }));
      const message = {
          subject: input.subject,
          body: { contentType: 'HTML', content: input.html || input.text || '' },
          toRecipients: recipients,
          attachments: toGraphAttachments(input.attachments),
      };
      await client.api(`/users/${encodeURIComponent(senderEmail)}/sendMail`).post({ message, saveToSentItems: true });
      return { sent: true };
    } catch (error: any) {
      console.error('[mailer] Exception sending email via MS Graph:', error?.message || error);
      return { sent: false, error: error?.message || 'MS Graph Error' };
    }
  } else {
    // Fallback to Nodemailer
    const client = getTransporter();
    if (!client) return { sent: false, error: 'SMTP is not configured on the server.' };
    try {
      const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
      await client.sendMail({
        from: fromEmail,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments
      });
      return { sent: true };
    } catch (error: any) {
      console.error('[mailer] Exception sending email via Nodemailer:', error?.message || error);
      return { sent: false, error: error?.message || 'Nodemailer Error' };
    }
  }
}


export function buildCompanyWelcomeEmail(params: {
  companyId: string;
  companyName: string;
  adminFirstName: string;
  adminEmail: string;
  adminPassword: string;
  loginUrl: string;
}): { subject: string; html: string } {
  const { companyId, companyName, adminFirstName, adminEmail, adminPassword, loginUrl } = params;
  return {
    // subject: `Your CrewCam HR Cloud workspace for ${companyName} is ready`,
    // html: `
    //   <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #18181b;">
    //     <h2 style="margin-bottom: 4px;">Welcome to CrewCam HR Cloud</h2>
    //     <p style="color: #52525b;">Hi ${adminFirstName}, your company workspace for <strong>${companyName}</strong> has been provisioned and is ready to use.</p>
    //     <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
    //       <tr><td style="padding: 8px 0; color: #71717a; width: 120px;">Company ID</td><td style="padding: 8px 0; font-family: monospace;"><strong>${companyId}</strong></td></tr>
    //       <tr><td style="padding: 8px 0; color: #71717a;">Login URL</td><td style="padding: 8px 0;"><a href="${loginUrl}">${loginUrl}</a></td></tr>
    //       <tr><td style="padding: 8px 0; color: #71717a;">Email</td><td style="padding: 8px 0;">${adminEmail}</td></tr>
    //       <tr><td style="padding: 8px 0; color: #71717a;">Password</td><td style="padding: 8px 0; font-family: monospace;">${adminPassword}</td></tr>
    //     </table>
    //     <p style="color: #71717a; font-size: 13px;">For security, please log in and change this password as soon as possible.</p>
    //   </div>
    // `,
    subject: `Welcome to HRCRM – Your ${companyName} Workspace Is Ready`,
    html: `
  <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #18181b; line-height: 1.6;">

    <h2 style="margin-bottom: 4px; color: #166534;">
      Welcome to HRCRM
    </h2>

    <p style="color: #52525b;">
      Dear ${adminFirstName},
    </p>

    <p style="color: #52525b;">
      Thank you for registering with <strong>HRCRM</strong>.
      Your company workspace for <strong>${companyName}</strong> has been successfully created and is ready to use.
    </p>

    <p style="color: #52525b;">
      You can access your HRCRM Portal using the login details below:
    </p>

    <table style="width: 100%; margin: 20px 0; border-collapse: collapse; background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 8px;">
      <tr>
        <td style="padding: 10px 12px; color: #71717a; width: 120px;">Company ID</td>
        <td style="padding: 10px 12px; font-family: monospace;">
          <strong>${companyId}</strong>
        </td>
      </tr>

      <tr>
        <td style="padding: 10px 12px; color: #71717a;">Login URL</td>
        <td style="padding: 10px 12px;">
          <a href="${loginUrl}" style="color: #166534; font-weight: 600; text-decoration: none;">
            ${loginUrl}
          </a>
        </td>
      </tr>

      <tr>
        <td style="padding: 10px 12px; color: #71717a;">Email</td>
        <td style="padding: 10px 12px;">
          ${adminEmail}
        </td>
      </tr>

      <tr>
        <td style="padding: 10px 12px; color: #71717a;">Password</td>
        <td style="padding: 10px 12px; font-family: monospace;">
          ${adminPassword}
        </td>
      </tr>
    </table>

    <p style="color: #52525b;">
      For your security, please do not share your login credentials with anyone.
      HRCRM or its representatives will never ask you to share your password.
    </p>

    <p style="color: #52525b;">
      Once you log in, we recommend changing your temporary password immediately
      and completing your company profile.
    </p>

    <p style="color: #52525b;">
      If you did not initiate this registration, please ignore this email or contact your HRCRM administrator.
    </p>

    <p style="color: #52525b; margin-top: 28px;">
      Warm Regards,<br>
      <strong>Team HRCRM</strong><br>
      Health & Wellness Relationship Management
    </p>

    <p style="color: #a1a1aa; font-size: 12px; margin-top: 30px;">
      © 2026 HRCRM. All Rights Reserved.<br>
      Powered by Namo Gange Wellness Pvt. Ltd.
    </p>

  </div>
`,

  };
}

export function buildCompanyGoLiveEmail(params: {
  companyName: string;
  adminFirstName: string;
  loginUrl: string;
  isFirstGoLive: boolean;
  corporateId?: string;
}): { subject: string; html: string } {
  const { companyName, adminFirstName, loginUrl, isFirstGoLive, corporateId } = params;
  const subject = isFirstGoLive
    ? `${companyName} is now live on Crewcam`
    : `New changes are live for ${companyName} on Crewcam`;
  const headline = isFirstGoLive ? 'Your workspace is live!' : 'New changes are live';
  const introLine = isFirstGoLive
    ? `Your company workspace for <strong>${companyName}</strong> has gone live on Crewcam. Your team can now log in and start using the system.`
    : `There are new changes to your <strong>${companyName}</strong> workspace on Crewcam, and those changes are now live.`;
  const statusLabel = isFirstGoLive ? 'Live' : 'Updated & Live';
  const loginHost = (() => { try { return new URL(loginUrl).host; } catch { return loginUrl; } })();
  const effectiveAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  return {
    subject,
    html: `
  <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #18181b; line-height: 1.6; border: 1px solid #e4e4e7; border-radius: 10px; overflow: hidden;">

    <div style="padding: 24px 24px 10px; text-align: center;">
      <h1 style="margin: 0; font-size: 22px; letter-spacing: 0.5px; color: #0b1638;">Crewcam</h1>
    </div>

    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="border-top: 2px solid #166534; padding: 8px 24px; font-size: 11px; color: #71717a;">${loginHost}</td>
        <td style="border-top: 2px solid #166534; padding: 8px 24px; font-size: 11px; color: #166534; text-align: right; font-weight: 700;">CREWCAM</td>
      </tr>
    </table>

    <div style="padding: 20px 24px;">
      <p style="color: #52525b;">Dear ${adminFirstName},</p>
      <p style="font-weight: 700; font-size: 14px; color: #166534; margin: 12px 0 4px;">${headline}</p>
      <p style="color: #52525b;">${introLine}</p>

      <table style="width: 100%; margin: 20px 0; border-collapse: collapse; background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 8px;">
        <tr>
          <td style="padding: 10px 12px; color: #71717a; width: 140px;">Company</td>
          <td style="padding: 10px 12px;"><strong>${companyName}</strong></td>
        </tr>
        ${corporateId ? `
        <tr>
          <td style="padding: 10px 12px; color: #71717a;">Corporate ID</td>
          <td style="padding: 10px 12px;"><strong style="font-family: monospace;">${corporateId}</strong></td>
        </tr>` : ''}
        <tr>
          <td style="padding: 10px 12px; color: #71717a;">Status</td>
          <td style="padding: 10px 12px;"><strong style="color: #166534;">${statusLabel}</strong></td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; color: #71717a;">Effective</td>
          <td style="padding: 10px 12px;">${effectiveAt}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; color: #71717a;">Login URL</td>
          <td style="padding: 10px 12px;">
            <a href="${loginUrl}" style="color: #166534; font-weight: 600; text-decoration: none;">${loginUrl}</a>
          </td>
        </tr>
      </table>
      ${corporateId ? `<p style="color: #71717a; font-size: 11.5px; margin-top: -8px;">Keep your Corporate ID handy — you'll need it to log in.</p>` : ''}

      <div style="background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 12px 14px; margin: 16px 0;">
        <p style="margin: 0 0 6px; font-weight: 700; font-size: 12px; color: #18181b;">📌 Important Note</p>
        <ul style="margin: 0; padding-left: 18px; color: #52525b; font-size: 12.5px; line-height: 1.8;">
          <li>This confirms your workspace changes are now visible to your team.</li>
          <li>If you did not expect this change, contact your Crewcam administrator immediately.</li>
          <li>You can review the latest configuration anytime from your dashboard.</li>
        </ul>
      </div>

      <div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 12px 14px; margin: 16px 0;">
        <p style="margin: 0 0 4px; font-weight: 700; font-size: 12px; color: #3730a3;">SUPPORT</p>
        <p style="margin: 0; font-size: 12px; color: #4338ca;">
          Need help with anything? Reach us anytime at
          <a href="mailto:support@crewcam.com" style="color: #3730a3; font-weight: 600; text-decoration: none;">support@crewcam.com</a>
        </p>
      </div>

      <p style="color: #52525b; margin-top: 24px;">
        Warm Regards,<br>
        <strong>Team Crewcam</strong>
      </p>
    </div>

    <div style="background: #fafafa; padding: 14px 24px; text-align: center; border-top: 1px solid #e4e4e7;">
      <p style="margin: 0; font-size: 11px; color: #a1a1aa;">
        © 2026 Crewcam. All Rights Reserved.<br>
        Powered by Namo Gange Wellness Pvt. Ltd.
      </p>
    </div>
  </div>
`,
  };
}

export function buildCredentialsResetEmail(params: {
  companyName: string;
  adminFirstName: string;
  adminEmail: string;
  adminPassword: string;
  loginUrl: string;
}): { subject: string; html: string } {
  const { companyName, adminFirstName, adminEmail, adminPassword, loginUrl } = params;
  return {
    subject: `Your CrewCam HR Cloud login credentials for ${companyName} have been reset`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #18181b;">
        <h2 style="margin-bottom: 4px;">Login credentials reset</h2>
        <p style="color: #52525b;">Hi ${adminFirstName}, your login credentials for <strong>${companyName}</strong> on CrewCam HR Cloud were just reset by the CrewCam team.</p>
        <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #71717a; width: 120px;">Login URL</td><td style="padding: 8px 0;"><a href="${loginUrl}">${loginUrl}</a></td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Email</td><td style="padding: 8px 0;">${adminEmail}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">New Password</td><td style="padding: 8px 0; font-family: monospace;">${adminPassword}</td></tr>
        </table>
        <p style="color: #71717a; font-size: 13px;">If you did not expect this, please contact CrewCam support immediately.</p>
      </div>
    `,
  };
}

export function buildPasswordResetEmail(params: {
  firstName?: string;
  resetUrl: string;
}): { subject: string; html: string } {
  const { firstName, resetUrl } = params;
  return {
    subject: 'Reset your CrewCam HR Cloud password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #18181b;">
        <h2 style="margin-bottom: 4px;">Reset your password</h2>
        <p style="color: #52525b;">Hi ${firstName || ''}, we received a request to reset your CrewCam HR Cloud password.</p>
        <p style="margin: 24px 0;"><a href="${resetUrl}" style="background: #4f46e5; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none;">Reset Password</a></p>
        <p style="color: #71717a; font-size: 13px;">This link expires in 30 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  };
}

export function buildEmployeeWelcomeEmail(params: {
  companyName: string;
  firstName: string;
  email: string;
  password: string;
  loginUrl: string;
}): { subject: string; html: string } {
  const { companyName, firstName, email, password, loginUrl } = params;
  return {
    subject: `Welcome to ${companyName}! Your login credentials are inside.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #18181b;">
        <h2 style="margin-bottom: 4px;">Welcome to ${companyName}!</h2>
        <p style="color: #52525b;">Hi ${firstName}, your employee account has been created on CrewCam HR Cloud.</p>
        <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #71717a; width: 120px;">Login URL</td><td style="padding: 8px 0;"><a href="${loginUrl}">${loginUrl}</a></td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Email</td><td style="padding: 8px 0;">${email}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Password</td><td style="padding: 8px 0; font-family: monospace; font-size: 16px;">${password}</td></tr>
        </table>
        <p style="color: #71717a; font-size: 13px;">For security, please log in and change your password as soon as possible.</p>
      </div>
    `,
  };
}


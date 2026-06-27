import nodemailer, { Transporter } from 'nodemailer';

let transporter: Transporter | null = null;
let configWarningLogged = false;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    if (!configWarningLogged) {
      console.warn('[mailer] SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS not fully configured — emails will not be sent.');
      configWarningLogged = true;
    }
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true' || Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail({ to, subject, html }: SendMailInput): Promise<{ sent: boolean; error?: string }> {
  const client = getTransporter();
  if (!client) {
    return { sent: false, error: 'SMTP is not configured on the server.' };
  }

  try {
    await client.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    });
    return { sent: true };
  } catch (error: any) {
    console.error('[mailer] Failed to send email:', error?.message || error);
    return { sent: false, error: error?.message || 'Unknown email delivery error' };
  }
}

export function buildCompanyWelcomeEmail(params: {
  companyName: string;
  adminFirstName: string;
  adminEmail: string;
  adminPassword: string;
  loginUrl: string;
}): { subject: string; html: string } {
  const { companyName, adminFirstName, adminEmail, adminPassword, loginUrl } = params;
  return {
    subject: `Your CrewCam HR Cloud workspace for ${companyName} is ready`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #18181b;">
        <h2 style="margin-bottom: 4px;">Welcome to CrewCam HR Cloud</h2>
        <p style="color: #52525b;">Hi ${adminFirstName}, your company workspace for <strong>${companyName}</strong> has been provisioned and is ready to use.</p>
        <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #71717a; width: 120px;">Login URL</td><td style="padding: 8px 0;"><a href="${loginUrl}">${loginUrl}</a></td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Email</td><td style="padding: 8px 0;">${adminEmail}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Password</td><td style="padding: 8px 0; font-family: monospace;">${adminPassword}</td></tr>
        </table>
        <p style="color: #71717a; font-size: 13px;">For security, please log in and change this password as soon as possible.</p>
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

import dotenv from 'dotenv';
dotenv.config();

import { sendMail } from './src/services/mailer';

async function test() {
  const otp = '123456';
  const html = `
<div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e5e5;">
  <div style="background-color: #155e75; padding: 20px; text-align: center; color: white;">
    <img src="https://res.cloudinary.com/dr8mld4i0/image/upload/v1789638742/crewcam_assets/aqfnuqg5vu8mrq67pfba.png" alt="CrewCam" style="height: 28px; vertical-align: middle;" />
  </div>
  <div style="padding: 30px; background-color: #ffffff;">
    <p style="margin-top: 0;">Namaskar,</p>
    <p>To proceed with your secure login to the <strong>CrewCam Dashboard</strong>, please verify your identity using the One-Time Password (OTP) below:</p>
    <div style="text-align: center; margin: 30px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #155e75; background: #f8fafc; padding: 12px 24px; border-radius: 6px; border: 1px solid #e2e8f0;">${otp}</span>
    </div>
    <p style="font-size: 14px; color: #475569;"><strong>This OTP is valid for 5 minutes only</strong> and can be used once.</p>
    <p style="font-size: 13px; color: #64748b;">For your security, please do not share this code with anyone. CrewCam will never ask for your OTP.</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;" />
    <p style="margin: 0; font-size: 14px;">Warm Regards,</p>
    <p style="margin: 4px 0 0 0; font-weight: bold; font-size: 14px;">Team CrewCam</p>
  </div>
</div>`;

  const result = await sendMail({
    to: 'tejodhara.chunduri@encodency.com', // Sending directly to this address
    subject: 'Your CrewCam Login OTP',
    html: html
  });
  console.log('Result:', result);
}

test().catch(console.error);

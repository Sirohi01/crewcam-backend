import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { notificationService } from '../services/notificationService';
import { Otp } from '../models/Otp';

export const sendWhatsAppOTP = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = (req.tenantId || req.user?.tenantId || req.body.tenantId) as string;
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    // Generate a 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in database with 5 min expiration
    await Otp.findOneAndUpdate(
      { phone },
      { 
        phone, 
        otp: otpCode, 
        tenantId, 
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) 
      },
      { upsert: true, new: true }
    );

    // Send OTP via Opus WhatsApp
    await notificationService.sendWhatsAppOTP(tenantId, phone, otpCode);

    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to send OTP', error: error.message });
  }
};

export const verifyWhatsAppOTP = async (req: AuthRequest, res: Response) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ message: 'Phone number and OTP are required' });
    }

    const validOtp = await Otp.findOne({ phone, otp });
    
    if (!validOtp) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Delete OTP after successful verification
    await Otp.deleteOne({ _id: validOtp._id });

    res.status(200).json({ message: 'OTP verified successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to verify OTP', error: error.message });
  }
};

export const sendWhatsAppMessage = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = (req.tenantId || req.user?.tenantId || req.body.tenantId) as string;
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ message: 'Phone number and message are required' });
    }

    await notificationService.sendWhatsApp(tenantId, phone, message);

    res.status(200).json({ message: 'Message sent successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to send WhatsApp message', error: error.message });
  }
};

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { notificationService } from '../services/notificationService';
import { CommunicationLog } from '../models/CommunicationLog';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { Notification } from '../models/Notification';
import { DailyQuote } from '../models/DailyQuote';

export const sendCommunication = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    
    const { type, recipientIds, subject, content } = req.body;
    
    if (!type || !recipientIds || !content || recipientIds.length === 0) {
      return res.status(400).json({ message: 'Type, recipients, and content are required' });
    }

    if (type === 'Email' && !subject) {
      return res.status(400).json({ message: 'Subject is required for Email' });
    }

    const recipients = await User.find({ _id: { $in: recipientIds }, tenantId });
    if (recipients.length === 0) {
      return res.status(404).json({ message: 'No valid recipients found' });
    }

    let successCount = 0;
    let failCount = 0;

    for (const recipient of recipients) {
      try {
        let sendResult;
        if (type === 'Email') {
          sendResult = await notificationService.sendEmail(tenantId, recipient.email, subject, content);
        } else if (type === 'SMS') {
          sendResult = await notificationService.sendSMS(tenantId, (recipient as any).phone || '', content);
        }

        await CommunicationLog.create({
          tenantId,
          type,
          senderId: req.user!._id,
          recipientIds: [recipient._id],
          subject: type === 'Email' ? subject : undefined,
          messageBody: content,
          status: 'Sent',
          providerResponse: sendResult?.simulated ? 'SIMULATED' : 'INTEGRATION'
        } as any);
        successCount++;
      } catch (err) {
        await CommunicationLog.create({
          tenantId,
          type,
          senderId: req.user!._id,
          recipientIds: [recipient._id],
          subject: type === 'Email' ? subject : undefined,
          messageBody: content,
          status: 'Failed'
        } as any);
        failCount++;
      }
    }

    await AuditLog.create({
      tenantId,
      userId: req.user!._id,
      action: 'SEND_COMMUNICATION',
      module: 'Communication',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { type, successCount, failCount }
    } as any);

    res.status(200).json({ 
      message: `Communication sent successfully. Success: ${successCount}, Failed: ${failCount}` 
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error sending communication', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getCommunicationLogs = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const logs = await CommunicationLog.find({ tenantId })
      .populate('senderId', 'firstName lastName')
      .populate('recipientIds', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(50); // limit for performance
      
    res.status(200).json(logs);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching communication logs', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

const buildAudienceFilter = (tenantId: any, audienceType: string, audienceValue?: string) => {
  const base: any = { tenantId, isActive: true };
  if (audienceType === 'Role') return { ...base, roleId: audienceValue };
  if (audienceType === 'Department') return { ...base, departmentId: audienceValue };
  if (audienceType === 'Branch') return { ...base, branchId: audienceValue };
  if (audienceType === 'User') return { ...base, _id: audienceValue };
  return base;
};

/**
 * Event-triggered notification to a single employee (meeting completed, MoM action
 * item assigned, etc.) — distinct from the HR broadcast-to-cohort form above, which
 * stays restricted to All/Role/Department/Branch. Shared so any controller can reuse
 * it instead of calling Notification.create inline.
 */
export const notifyUser = async (tenantId: any, recipientId: any, createdBy: any, title: string, message: string, link?: string) => {
  return Notification.create({
    tenantId,
    title,
    message,
    audienceType: 'User',
    audienceValue: recipientId,
    ...(link ? { link } : {}),
    createdBy,
    readBy: [],
  } as any);
};

/**
 * Add HR Notification: an in-app broadcast (distinct from the Email/SMS senders
 * above). Rate-limited at the route level — see bulkNotificationLimiter.
 */
export const createNotification = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const { title, message, audienceType, audienceValue } = req.body;
    if (!title || !message) return res.status(400).json({ message: 'Title and message are required' });

    const type = ['All', 'Role', 'Department', 'Branch'].includes(audienceType) ? audienceType : 'All';
    if (type !== 'All' && !audienceValue) {
      return res.status(400).json({ message: 'audienceValue is required for a non-All audienceType' });
    }

    const audienceFilter = buildAudienceFilter(tenantId, type, audienceValue);
    const recipientCount = await User.countDocuments(audienceFilter as any);

    const notification = await Notification.create({
      tenantId,
      title,
      message,
      audienceType: type,
      audienceValue,
      createdBy: req.user._id,
      readBy: [],
    });

    await AuditLog.create({
      tenantId,
      userId: req.user._id,
      action: 'SEND_NOTIFICATION',
      module: 'Communication',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { notificationId: notification._id, audienceType: type, recipientCount },
    } as any);

    res.status(201).json({ message: `Notification sent to ${recipientCount} employee(s)`, notification });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating notification', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getMyNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const notifications = await Notification.find({
      tenantId,
      $or: [
        { audienceType: 'All' },
        { audienceType: 'Role', audienceValue: req.user.roleId },
        { audienceType: 'Department', audienceValue: req.user.departmentId },
        { audienceType: 'Branch', audienceValue: req.user.branchId },
        { audienceType: 'User', audienceValue: req.user._id },
      ],
    } as any).sort({ createdAt: -1 }).limit(50);

    res.status(200).json(notifications);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching notifications', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const markNotificationRead = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const { id } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, tenantId } as any,
      { $addToSet: { readBy: req.user._id } },
      { returnDocument: 'after' }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.status(200).json(notification);
  } catch (error: any) {
    res.status(500).json({ message: 'Error marking notification read', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const createDailyQuote = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const { text, author, scheduledDate } = req.body;
    if (!text || !scheduledDate) return res.status(400).json({ message: 'text and scheduledDate are required' });

    const quote = await DailyQuote.create({
      tenantId,
      text,
      author,
      scheduledDate: new Date(scheduledDate),
      createdBy: req.user._id,
    } as any);

    res.status(201).json({ message: 'Daily quote scheduled', quote });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating daily quote', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getDailyQuotes = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const quotes = await DailyQuote.find({ tenantId, isActive: true } as any).sort({ scheduledDate: -1 }).limit(100);
    res.status(200).json(quotes);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching daily quotes', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getTodayQuote = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const quote = await DailyQuote.findOne({
      tenantId, isActive: true, scheduledDate: { $gte: startOfDay, $lte: endOfDay },
    } as any);

    res.status(200).json(quote || null);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching today\'s quote', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

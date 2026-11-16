import { Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { EmergencyAlert, IContactNotice } from '../models/EmergencyAlert';
import { EmergencySettings } from '../models/EmergencySettings';
import { EmployeeProfileDetail } from '../models/EmployeeProfileDetail';
import { Company } from '../models/Company';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { Notification } from '../models/Notification';
import { notificationService } from '../services/notificationService';
import { isOwnUploadUrl } from '../utils/fileStorage';
import '../models/Department';

/**
 * Emergency alerts and company safety information (Phase 1D-3b).
 *
 * Employee: read the Emergency page data, trigger an alert, cancel it as a false alarm.
 * Responders (EMERGENCY_RESPOND, or '*'): see alerts, acknowledge, resolve.
 * ORG_WRITE: edit the company's safety information.
 */

export const EMERGENCY_PERMISSION = 'EMERGENCY_RESPOND';
const OPEN: Array<'Active' | 'Acknowledged'> = ['Active', 'Acknowledged'];

const tenantIdOf = (req: AuthRequest) => (req.tenantId || req.user?.tenantId) as string;
const fail = (res: Response, message: string, error: any) =>
  res.status(500).json({ message, ...(process.env.NODE_ENV === 'production' ? {} : { error: error?.message }) });
const fullName = (u: any) => `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || 'An employee';

/** Everyone who should hear about an alert: responders plus the reporting manager, never the reporter. */
const findResponders = async (tenantId: string, reporter: any): Promise<mongoose.Types.ObjectId[]> => {
  const roles = await Role.find({ tenantId, isActive: { $ne: false }, permissions: { $in: ['*', EMERGENCY_PERMISSION] } } as any).select('_id').lean();
  const users = await User.find({ tenantId, isActive: true, roleId: { $in: roles.map((r: any) => r._id) } } as any).select('_id').lean();
  const ids = new Map(users.map((u: any) => [String(u._id), u._id]));
  if (reporter.reportingToId) ids.set(String(reporter.reportingToId), new mongoose.Types.ObjectId(String(reporter.reportingToId)));
  ids.delete(String(reporter._id));
  return [...ids.values()];
};

const notifyMany = async (tenantId: string, userIds: mongoose.Types.ObjectId[], createdBy: unknown, title: string, message: string, link: string) => {
  if (!userIds.length) return;
  await Notification.insertMany(userIds.map((id) => ({
    tenantId, title, message, link, priority: 'High', audienceType: 'User', audienceValue: id, createdBy, readBy: [],
  })) as any);
};

const mapsLink = (loc?: { lat: number; lng: number }) => (loc ? `https://maps.google.com/?q=${loc.lat},${loc.lng}` : '');

// ── Employee ──────────────────────────────────────────────────────────────

/** Company safety info (with the company address as the office-address fallback) and my alerts. */
export const getMyEmergency = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = tenantIdOf(req);
    const [settings, company, alerts]: any[] = await Promise.all([
      EmergencySettings.findOne({ tenantId } as any).lean(),
      Company.findOne({ tenantId }).setOptions({ bypassTenantIsolation: true }).select('addressLine1 addressLine2 city state country').lean(),
      EmergencyAlert.find({ tenantId, userId: req.user!._id } as any).sort({ createdAt: -1 }).limit(10)
        .populate('acknowledgedBy resolvedBy', 'firstName lastName').lean(),
    ]);
    const companyAddress = company ? [company.addressLine1, company.addressLine2, company.city, company.state].filter(Boolean).join(', ') : '';
    res.json({
      settings: {
        helplines: settings?.helplines ?? [],
        officeAddress: settings?.officeAddress || companyAddress || '',
        nearestHospital: settings?.nearestHospital || '',
        assemblyPoint: settings?.assemblyPoint || '',
        aedLocation: settings?.aedLocation || '',
        emergencyExits: settings?.emergencyExits || '',
        safetyTips: settings?.safetyTips ?? [],
        guideUrl: settings?.guideUrl || '',
        safetyMapUrl: settings?.safetyMapUrl || '',
        smsEmergencyContacts: !!settings?.smsEmergencyContacts,
        configured: !!settings,
      },
      alerts,
      activeAlert: alerts.find((a: any) => OPEN.includes(a.status)) || null,
    });
  } catch (error) {
    fail(res, 'Error loading emergency information', error);
  }
};

const TRIGGER_SCHEMA = z.object({
  message: z.string().trim().max(500).optional(),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().min(0).optional(),
  }).optional(),
});

/**
 * Raise an alert. Idempotent while one is open — pressing the button again returns the
 * same alert instead of paging responders twice.
 */
export const triggerMyAlert = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = tenantIdOf(req);
    const parsed = TRIGGER_SCHEMA.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: 'Invalid alert', errors: parsed.error.issues });

    const existing = await EmergencyAlert.findOne({ tenantId, userId: req.user!._id, status: { $in: OPEN } } as any);
    if (existing) return res.json({ message: 'Your alert is already active — help has been notified', alert: existing, duplicate: true });

    const reporter: any = req.user!;
    const alert = await EmergencyAlert.create({ tenantId, userId: reporter._id, ...parsed.data } as any);

    const responders = await findResponders(tenantId, reporter);
    const where = parsed.data.location ? ' Location shared.' : '';
    await notifyMany(tenantId, responders, reporter._id, `🚨 Emergency alert: ${fullName(reporter)}`,
      `${fullName(reporter)} triggered an emergency alert.${parsed.data.message ? ` "${parsed.data.message}"` : ''}${where}`, '/dashboard/emergency-alerts');

    // Texts to emergency contacts, only if the company switched this on.
    const settings: any = await EmergencySettings.findOne({ tenantId } as any).select('smsEmergencyContacts').lean();
    const notices: IContactNotice[] = [];
    if (settings?.smsEmergencyContacts) {
      const detail: any = await EmployeeProfileDetail.findOne({ tenantId, userId: reporter._id } as any).select('emergencyContacts').lean();
      const contacts: Array<{ name: string; mobile: string }> = detail?.emergencyContacts?.length
        ? detail.emergencyContacts
        : reporter.emergencyContactName && reporter.emergencyContactNumber
          ? [{ name: reporter.emergencyContactName, mobile: reporter.emergencyContactNumber }]
          : [];
      const text = `EMERGENCY: ${fullName(reporter)} has raised an emergency alert at work and listed you as an emergency contact. ${mapsLink(parsed.data.location)}`.trim();
      for (const c of contacts.slice(0, 5)) {
        try {
          const result: any = await notificationService.sendSMS(tenantId, c.mobile, text);
          // The SMS service "succeeds" in simulation when no provider is configured — record that honestly.
          notices.push({ name: c.name, mobile: c.mobile, result: result?.simulated ? 'not-configured' : 'sent' });
        } catch {
          notices.push({ name: c.name, mobile: c.mobile, result: 'failed' });
        }
      }
    }

    alert.respondersNotified = responders.length;
    alert.contactNotices = notices;
    await alert.save();

    await AuditLog.create({
      tenantId, userId: reporter._id, action: 'TRIGGER_EMERGENCY_ALERT', module: 'Emergency', status: 'SUCCESS',
      ipAddress: req.ip as string, userAgent: req.headers['user-agent'] as string,
      details: { alertId: alert._id, respondersNotified: responders.length, contacts: notices.map((n) => n.result) },
    } as any);

    res.status(201).json({ message: responders.length ? `${responders.length} responder(s) notified` : 'Alert raised — but no responder is set up for your company. Call a helpline.', alert });
  } catch (error) {
    fail(res, 'Error raising the alert', error);
  }
};

/** The employee calls off their own open alert (false alarm, or help no longer needed). */
export const cancelMyAlert = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = tenantIdOf(req);
    const alert = await EmergencyAlert.findOneAndUpdate(
      { _id: req.params.id, tenantId, userId: req.user!._id, status: { $in: OPEN } } as any,
      { $set: { status: 'Cancelled', resolvedAt: new Date(), resolvedBy: req.user!._id, resolutionNote: 'Cancelled by the employee' } },
      { returnDocument: 'after' }
    );
    if (!alert) return res.status(404).json({ message: 'No open alert of yours with that ID' });

    const responders = await findResponders(tenantId, req.user!);
    await notifyMany(tenantId, responders, req.user!._id, `Emergency alert cancelled: ${fullName(req.user)}`,
      `${fullName(req.user)} cancelled their emergency alert.`, '/dashboard/emergency-alerts');
    res.json({ message: 'Alert cancelled', alert });
  } catch (error) {
    fail(res, 'Error cancelling the alert', error);
  }
};

// ── Responders ────────────────────────────────────────────────────────────

export const listAlerts = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = tenantIdOf(req);
    const filter: any = { tenantId };
    if (req.query.status === 'open') filter.status = { $in: OPEN };
    else if (typeof req.query.status === 'string' && ['Active', 'Acknowledged', 'Resolved', 'Cancelled'].includes(req.query.status)) filter.status = req.query.status;

    const [alerts, openCount] = await Promise.all([
      EmergencyAlert.find(filter).sort({ createdAt: -1 }).limit(100)
        .populate({ path: 'userId', select: 'firstName lastName employeeCode mobileNumber departmentId', populate: { path: 'departmentId', select: 'name' } })
        .populate('acknowledgedBy resolvedBy', 'firstName lastName')
        .lean(),
      EmergencyAlert.countDocuments({ tenantId, status: { $in: OPEN } } as any),
    ]);
    res.json({ alerts, openCount });
  } catch (error) {
    fail(res, 'Error fetching alerts', error);
  }
};

const UPDATE_SCHEMA = z.object({
  status: z.enum(['Acknowledged', 'Resolved']),
  note: z.string().trim().max(1000).optional(),
});

export const updateAlert = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = tenantIdOf(req);
    const parsed = UPDATE_SCHEMA.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'status must be Acknowledged or Resolved', errors: parsed.error.issues });
    const { status, note } = parsed.data;

    const existing = await EmergencyAlert.findOne({ _id: req.params.id, tenantId } as any);
    if (!existing) return res.status(404).json({ message: 'Alert not found' });
    if (String(existing.userId) === String(req.user!._id)) return res.status(403).json({ message: 'Someone else must respond to your own alert' });

    const from = status === 'Acknowledged' ? ['Active'] : OPEN;
    const set: any = status === 'Acknowledged'
      ? { status, acknowledgedBy: req.user!._id, acknowledgedAt: new Date() }
      : { status, resolvedBy: req.user!._id, resolvedAt: new Date(), ...(note ? { resolutionNote: note } : {}) };
    if (status === 'Resolved' && !existing.acknowledgedAt) Object.assign(set, { acknowledgedBy: req.user!._id, acknowledgedAt: new Date() });

    const alert = await EmergencyAlert.findOneAndUpdate({ _id: existing._id, tenantId, status: { $in: from } } as any, { $set: set }, { returnDocument: 'after' });
    if (!alert) return res.status(409).json({ message: `This alert is already ${existing.status.toLowerCase()}` });

    await notifyMany(tenantId, [existing.userId as any], req.user!._id,
      status === 'Acknowledged' ? 'Help is on the way' : 'Your emergency alert was resolved',
      status === 'Acknowledged' ? `${fullName(req.user)} has seen your alert and is responding.` : `${fullName(req.user)} marked your alert resolved.${note ? ` ${note}` : ''}`,
      '/dashboard/employee/emergency');
    await AuditLog.create({
      tenantId, userId: req.user!._id, action: `EMERGENCY_ALERT_${status.toUpperCase()}`, module: 'Emergency', status: 'SUCCESS',
      ipAddress: req.ip as string, userAgent: req.headers['user-agent'] as string, details: { alertId: alert._id },
    } as any);
    res.json({ message: `Alert ${status.toLowerCase()}`, alert });
  } catch (error) {
    fail(res, 'Error updating the alert', error);
  }
};

// ── Company safety settings ───────────────────────────────────────────────

const optionalText = z.string().trim().max(300).optional();
const docUrl = z.union([z.literal(''), z.string().refine(isOwnUploadUrl, 'Documents must be uploaded through the app')]).optional();
const SETTINGS_SCHEMA = z.object({
  helplines: z.array(z.object({
    label: z.string().trim().min(1).max(60),
    number: z.string().trim().regex(/^[+\d][\d\s-]{2,19}$/, 'must be a phone number'),
    available24x7: z.boolean().default(true),
  })).max(8).optional(),
  officeAddress: optionalText,
  nearestHospital: optionalText,
  assemblyPoint: optionalText,
  aedLocation: optionalText,
  emergencyExits: optionalText,
  safetyTips: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  guideUrl: docUrl,
  safetyMapUrl: docUrl,
  smsEmergencyContacts: z.boolean().optional(),
}).strict();

export const getEmergencySettings = async (req: AuthRequest, res: Response) => {
  try {
    const settings = await EmergencySettings.findOne({ tenantId: tenantIdOf(req) } as any).lean();
    res.json(settings || { helplines: [], safetyTips: [], smsEmergencyContacts: false });
  } catch (error) {
    fail(res, 'Error loading safety settings', error);
  }
};

export const updateEmergencySettings = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = tenantIdOf(req);
    const parsed = SETTINGS_SCHEMA.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid safety settings', errors: parsed.error.issues });

    const settings = await EmergencySettings.findOneAndUpdate(
      { tenantId } as any,
      // The upsert takes tenantId from the filter (the tenant guard strips it from update bodies).
      { $set: { ...parsed.data, updatedBy: req.user!._id } },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );
    res.json({ message: 'Safety information saved', settings });
  } catch (error) {
    fail(res, 'Error saving safety settings', error);
  }
};

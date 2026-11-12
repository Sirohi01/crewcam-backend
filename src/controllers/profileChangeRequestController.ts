import { Response } from 'express';
import mongoose from 'mongoose';
import moment from 'moment';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { BankPayrollInfo } from '../models/BankPayrollInfo';
import { AuditLog } from '../models/AuditLog';
import { ProfileChangeRequest, ChangeRequestKind, IChangeSummaryItem } from '../models/ProfileChangeRequest';
import { decrypt, encrypt } from '../utils/encryption';
import { isOwnUploadUrl } from '../utils/fileStorage';

/**
 * HR-approved changes to HR-owned employee data (Phase 1E). Employees propose; HR
 * (EMPLOYEE_WRITE) approves or rejects. Nothing is applied until approved, and nobody
 * can review their own request — a salary-account change must be a second person's call.
 */

const blank = (v: unknown) => (v === '' || v === null ? undefined : v);
const upper = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : v);
const digits = (v: unknown) => (typeof v === 'string' ? v.replace(/[\s-]/g, '') : v);

const IDENTITY_SCHEMA = z.object({
  firstName: z.preprocess(blank, z.string().trim().min(1).max(60).optional()),
  lastName: z.preprocess(blank, z.string().trim().min(1).max(60).optional()),
  dateOfBirth: z.preprocess(blank, z.coerce.date()
    .refine((d) => moment().diff(moment(d), 'years') >= 14, 'must be at least 14 years ago')
    .refine((d) => moment().diff(moment(d), 'years') <= 100, 'is not plausible')
    .optional()),
  gender: z.preprocess(blank, z.enum(['male', 'female', 'other']).optional()),
  panNumber: z.preprocess((v) => upper(blank(v)), z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'must look like ABCDE1234F').optional()),
  aadhaarNumber: z.preprocess((v) => digits(blank(v)), z.string().regex(/^\d{12}$/, 'must be 12 digits').optional()),
  uanNumber: z.preprocess((v) => digits(blank(v)), z.string().regex(/^\d{12}$/, 'must be 12 digits').optional()),
}).strict();

const BANK_SCHEMA = z.object({
  bankName: z.preprocess(blank, z.string().trim().min(2).max(100).optional()),
  accountHolderName: z.preprocess(blank, z.string().trim().min(2).max(100).optional()),
  accountNumber: z.preprocess((v) => digits(blank(v)), z.string().regex(/^\d{6,18}$/, 'must be 6-18 digits').optional()),
  ifscCode: z.preprocess((v) => upper(blank(v)), z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'must look like HDFC0001234').optional()),
  branchName: z.preprocess(blank, z.string().trim().max(100).optional()),
  accountType: z.preprocess(blank, z.enum(['Savings', 'Current']).optional()),
  micrCode: z.preprocess((v) => digits(blank(v)), z.string().regex(/^\d{9}$/, 'must be 9 digits').optional()),
}).strict();

const SCHEMAS: Record<ChangeRequestKind, z.ZodTypeAny> = { identity: IDENTITY_SCHEMA, bank: BANK_SCHEMA };

const LABELS: Record<string, string> = {
  firstName: 'First Name', lastName: 'Last Name', dateOfBirth: 'Date of Birth', gender: 'Gender',
  panNumber: 'PAN', aadhaarNumber: 'Aadhaar', uanNumber: 'UAN',
  bankName: 'Bank Name', accountHolderName: 'Account Holder', accountNumber: 'Account Number',
  ifscCode: 'IFSC', branchName: 'Branch', accountType: 'Account Type', micrCode: 'MICR',
};
const SENSITIVE = new Set(['panNumber', 'aadhaarNumber', 'uanNumber', 'accountNumber']);

const tenantIdOf = (req: AuthRequest) => (req.tenantId || req.user?.tenantId) as string;
const mask = (v: string) => (v.length > 4 ? `${'X'.repeat(v.length - 4)}${v.slice(-4)}` : v);
const display = (field: string, v: unknown): string => {
  if (v === undefined || v === null || v === '') return '';
  const s = v instanceof Date ? moment(v).format('YYYY-MM-DD') : String(v);
  return SENSITIVE.has(field) ? mask(s) : s;
};
const firstIssue = (e: z.ZodError) => {
  const i = e.issues[0];
  if (!i) return 'Invalid input';
  if (i.code === 'unrecognized_keys') return 'One or more fields cannot be changed through this request';
  const field = i.path.find((p) => typeof p === 'string') as string | undefined;
  return field ? `${LABELS[field] || field} ${i.message}` : i.message;
};

/** Current values for the fields a request touches (decrypted, never returned raw). */
const currentValues = async (kind: ChangeRequestKind, tenantId: string, userId: unknown): Promise<Record<string, unknown> | null> => {
  if (kind === 'identity') {
    const u: any = await User.findOne({ _id: userId, tenantId } as any).lean();
    return u || null;
  }
  const bank: any = await BankPayrollInfo.findOne({ tenantId, employeeId: userId } as any).sort({ updatedAt: -1 });
  if (!bank) return {};
  const raw = bank.toObject({ transform: false });
  return { ...raw, accountNumber: raw.accountNumber ? bank.getDecryptedAccountNumber() : undefined };
};

const writeAudit = (req: AuthRequest, action: string, details: Record<string, unknown>) =>
  AuditLog.create({
    tenantId: tenantIdOf(req), userId: req.user!._id as any, action, module: 'Employees', status: 'SUCCESS',
    ipAddress: req.ip as string, userAgent: req.headers['user-agent'] as string, details,
  } as any).catch(() => undefined);

// ─── Employee side (/me/change-requests) ──────────────────────────────────

/** POST /me/change-requests  { kind, changes: {...}, comment?, attachmentUrl? } */
export const createChangeRequest = async (req: AuthRequest, res: Response) => {
  const kind = req.body?.kind as ChangeRequestKind;
  const schema = SCHEMAS[kind];
  if (!schema) return res.status(400).json({ message: "kind must be 'identity' or 'bank'" });

  const parsed = schema.safeParse(req.body?.changes || {});
  if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

  const { comment, attachmentUrl } = req.body;
  if (attachmentUrl && !isOwnUploadUrl(attachmentUrl)) {
    return res.status(400).json({ message: 'Attachment must be uploaded through the app' });
  }
  if (comment && String(comment).length > 1000) return res.status(400).json({ message: 'Comment is too long' });

  try {
    const tenantId = tenantIdOf(req);
    const existing = await ProfileChangeRequest.findOne({ tenantId, userId: req.user!._id, kind, status: 'Pending' });
    if (existing) return res.status(409).json({ message: 'You already have a pending request of this type. Cancel it or wait for HR.' });

    const current = (await currentValues(kind, tenantId, req.user!._id)) || {};
    const proposed = Object.fromEntries(Object.entries(parsed.data as Record<string, unknown>).filter(([, v]) => v !== undefined));
    const summary: IChangeSummaryItem[] = Object.entries(proposed)
      .filter(([field, value]) => display(field, current[field]) !== display(field, value) || (SENSITIVE.has(field) && String(current[field] ?? '') !== String(value)))
      .map(([field, value]) => ({ field, label: LABELS[field] || field, from: display(field, current[field]), to: display(field, value) }));
    if (summary.length === 0) return res.status(400).json({ message: 'No changes to request' });

    const changed = Object.fromEntries(summary.map((s) => [s.field, proposed[s.field]]));
    const request = await ProfileChangeRequest.create({
      tenantId,
      userId: req.user!._id,
      kind,
      proposedEncrypted: encrypt(JSON.stringify(changed)),
      summary,
      employeeComment: comment ? String(comment).trim() : undefined,
      attachmentUrl: attachmentUrl || undefined,
      createdBy: req.user!._id,
    } as any);
    await writeAudit(req, 'PROFILE_CHANGE_REQUESTED', { requestId: request._id, kind, fields: summary.map((s) => s.field) });

    const { proposedEncrypted: _hidden, ...safe } = request.toObject() as any;
    res.status(201).json({ message: 'Request sent to HR for approval', data: safe });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to create change request' });
  }
};

/** GET /me/change-requests — the caller's own requests (masked summaries only). */
export const getMyChangeRequests = async (req: AuthRequest, res: Response) => {
  try {
    const data = await ProfileChangeRequest.find({ tenantId: tenantIdOf(req), userId: req.user!._id })
      .select('-auditTrail')
      .populate('reviewerId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ data });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to load change requests' });
  }
};

/** POST /me/change-requests/:id/cancel — only the requester, only while pending. */
export const cancelMyChangeRequest = async (req: AuthRequest, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Request not found' });
  try {
    const updated = await ProfileChangeRequest.findOneAndUpdate(
      { _id: req.params.id, tenantId: tenantIdOf(req), userId: req.user!._id, status: 'Pending' },
      { $set: { status: 'Cancelled', updatedBy: req.user!._id } },
      { returnDocument: 'after' }
    ).lean();
    if (!updated) return res.status(404).json({ message: 'No pending request to cancel' });
    res.json({ message: 'Request cancelled', data: updated });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to cancel request' });
  }
};

// ─── HR side (/change-requests, EMPLOYEE_WRITE) ───────────────────────────

/** GET /change-requests?status=Pending|Approved|Rejected|Cancelled */
export const listChangeRequests = async (req: AuthRequest, res: Response) => {
  try {
    const status = String(req.query.status || 'Pending');
    const filter: any = { tenantId: tenantIdOf(req) };
    if (['Pending', 'Approved', 'Rejected', 'Cancelled'].includes(status)) filter.status = status;
    const data = await ProfileChangeRequest.find(filter)
      .select('-auditTrail')
      .populate('userId', 'firstName lastName employeeCode email profilePictureUrl')
      .populate('reviewerId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ data });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to load change requests' });
  }
};

/** GET /change-requests/:id — includes the full proposed values for the reviewer to verify. */
export const getChangeRequest = async (req: AuthRequest, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Request not found' });
  try {
    const doc: any = await ProfileChangeRequest.findOne({ _id: req.params.id, tenantId: tenantIdOf(req) })
      .select('+proposedEncrypted -auditTrail')
      .populate('userId', 'firstName lastName employeeCode email')
      .lean();
    if (!doc) return res.status(404).json({ message: 'Request not found' });
    const { proposedEncrypted, ...rest } = doc;
    await writeAudit(req, 'PROFILE_CHANGE_VIEWED', { requestId: doc._id });
    res.json({ data: { ...rest, proposed: JSON.parse(decrypt(proposedEncrypted)) } });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to load change request' });
  }
};

/** PUT /change-requests/:id/review  { decision: 'Approved' | 'Rejected', comment } */
export const reviewChangeRequest = async (req: AuthRequest, res: Response) => {
  const { decision, comment } = req.body || {};
  if (!['Approved', 'Rejected'].includes(decision)) return res.status(400).json({ message: "decision must be 'Approved' or 'Rejected'" });
  if (decision === 'Rejected' && !String(comment || '').trim()) return res.status(400).json({ message: 'Please give a reason for rejecting' });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Request not found' });

  try {
    const tenantId = tenantIdOf(req);
    const request: any = await ProfileChangeRequest.findOne({ _id: req.params.id, tenantId }).select('+proposedEncrypted');
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status !== 'Pending') return res.status(409).json({ message: `This request is already ${request.status.toLowerCase()}` });
    if (String(request.userId) === String(req.user!._id)) {
      return res.status(403).json({ message: 'You cannot review your own change request' });
    }

    if (decision === 'Approved') {
      const proposed = JSON.parse(decrypt(request.proposedEncrypted));
      if (request.kind === 'identity') {
        if (proposed.dateOfBirth) proposed.dateOfBirth = new Date(proposed.dateOfBirth);
        const result = await User.updateOne({ _id: request.userId, tenantId } as any, { $set: { ...proposed, updatedBy: req.user!._id } });
        if (!result.matchedCount) return res.status(404).json({ message: 'Employee no longer exists' });
      } else {
        const bank: any = await BankPayrollInfo.findOne({ tenantId, employeeId: request.userId } as any).sort({ updatedAt: -1 });
        if (!bank) {
          return res.status(409).json({ message: 'This employee has no bank record yet. Capture it in payroll setup, then approve.' });
        }
        Object.assign(bank, proposed);
        bank.status = 'Verified';
        bank.verificationDate = moment().format('YYYY-MM-DD');
        bank.verifiedBy = `${req.user!.firstName} ${req.user!.lastName}`;
        await bank.save(); // save() runs the model's encryption hook for the account number
      }
    }

    request.status = decision;
    request.reviewerId = req.user!._id;
    request.reviewerComment = comment ? String(comment).trim() : undefined;
    request.reviewedAt = new Date();
    request.updatedBy = req.user!._id;
    await request.save();
    await writeAudit(req, decision === 'Approved' ? 'PROFILE_CHANGE_APPROVED' : 'PROFILE_CHANGE_REJECTED', {
      requestId: request._id, employeeId: request.userId, kind: request.kind, fields: request.summary.map((s: any) => s.field),
    });

    const { proposedEncrypted: _hidden, ...safe } = request.toObject();
    res.json({ message: `Request ${decision.toLowerCase()}`, data: safe });
  } catch (error: any) {
    if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
    res.status(500).json({ message: 'Failed to review change request' });
  }
};

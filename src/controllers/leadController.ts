import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Lead, LeadStage } from '../models/Lead';
import { LeadProposal } from '../models/LeadProposal';
import { LeadMasterData } from '../models/LeadMasterData';
import { LeadReminderSettings } from '../models/LeadReminderSettings';
import { AuditLog } from '../models/AuditLog';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { generateProposalNumber, buildProposalPdf } from '../services/billingDocuments';
import { sendMail } from '../services/mailer';
import { calculateLeadScore } from '../utils/leadScore';
import { z } from 'zod';

const leadSchema = z.object({
  companyName: z.string().trim().min(2, 'Company name must be at least 2 characters'),
  leadType: z.enum(['DOMESTIC', 'INTERNATIONAL']).optional().default('DOMESTIC'),
  typeOfBusiness: z.string().optional(),
  industry: z.string().optional(),
  companyWebsite: z.string().optional(),
  companyEmail: z.string().trim().email().optional().or(z.literal('')),
  landlineNo: z.string().optional(),
  fullAddress: z.string().optional(),
  country: z.string().optional().default('India'),
  pinCode: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  contactTitle: z.string().optional(),
  contactName: z.string().trim().min(1, 'Contact name is required'),
  contactSurname: z.string().optional(),
  contactDesignation: z.string().optional(),
  contactEmail: z.string().trim().email('A valid contact email is required'),
  contactPhone: z.string().optional(),
  alternateContactPhone: z.string().optional(),
  additionalContacts: z.array(z.object({
    title: z.string().optional(),
    firstName: z.string().optional(),
    surname: z.string().optional(),
    designation: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    alternatePhone: z.string().optional(),
  })).optional(),
  source: z.string().trim().optional().default('OTHER'),
  leadDate: z.coerce.date().optional(),
  assignedTo: z.string().optional(),
  followUpDate: z.coerce.date().optional(),
  temperature: z.enum(['NEW', 'WARM', 'HOT', 'COLD']).optional().default('NEW'),
  stage: z.enum(['LEAD', 'DEMO_SCHEDULED', 'PROPOSAL_SENT', 'QUOTATION_APPROVED', 'WON', 'LOST']).optional().default('LEAD'),
  estimatedValue: z.coerce.number().min(0).optional().default(0),
  currency: z.enum(['INR', 'USD']).optional().default('INR'),
  notes: z.string().optional(),
  lostReason: z.string().optional(),
  convertedTenantId: z.string().optional(),
});

async function writeAudit(action: string, userId: any, details: Record<string, any>) {
  try {
    await AuditLog.create({ tenantId: 'system', userId, action, module: 'CRM', status: 'SUCCESS', details } as any);
  } catch (err) {
    console.error('[audit] failed to write lead audit log:', err);
  }
}

export const getAllLeads = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (req.query.stage) {
      const stages = String(req.query.stage).split(',').map((s) => s.trim()).filter(Boolean);
      query.stage = stages.length > 1 ? { $in: stages } : stages[0];
    }
    if (req.query.source) query.source = req.query.source;
    if (req.query.temperature) query.temperature = req.query.temperature;
    if (req.query.industry) query.industry = req.query.industry;
    if (req.query.owner === 'me' && req.user?._id) query.assignedTo = req.user._id;
    if (req.query.followUpDateFrom || req.query.followUpDateTo) {
      query.followUpDate = {};
      if (req.query.followUpDateFrom) query.followUpDate.$gte = new Date(String(req.query.followUpDateFrom));
      if (req.query.followUpDateTo) query.followUpDate.$lte = new Date(String(req.query.followUpDateTo));
    }
    if (req.query.followUpStatus) {
      query.followUpDate = { $ne: null };
      query.stage = { $nin: ['WON', 'LOST'] };
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
      const startOfDayAfterTomorrow = new Date(startOfToday.getTime() + 2 * 24 * 60 * 60 * 1000);
      const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
      const endOfMonth = new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (req.query.followUpStatus === 'overdue') query.followUpDate = { ...query.followUpDate, $lt: now };
      else if (req.query.followUpStatus === 'today') query.followUpDate = { ...query.followUpDate, $gte: now, $lt: startOfTomorrow };
      else if (req.query.followUpStatus === 'tomorrow') query.followUpDate = { ...query.followUpDate, $gte: startOfTomorrow, $lt: startOfDayAfterTomorrow };
      else if (req.query.followUpStatus === 'week') query.followUpDate = { ...query.followUpDate, $gte: startOfDayAfterTomorrow, $lt: endOfWeek };
      else if (req.query.followUpStatus === 'month') query.followUpDate = { ...query.followUpDate, $gte: now, $lt: endOfMonth };
    }
    if (req.query.search) {
      const search = new RegExp(String(req.query.search), 'i');
      query.$or = [{ companyName: search }, { contactName: search }, { contactEmail: search }];
    }

    const sort = req.query.followUpStatus ? { followUpDate: 1 as const } : { updatedAt: -1 as const };
    const [leads, total] = await Promise.all([
      Lead.find(query).sort(sort).skip(skip).limit(limit).populate('assignedTo', 'firstName lastName').lean(),
      Lead.countDocuments(query),
    ]);

    const data = leads.map((lead) => ({ ...lead, leadScore: calculateLeadScore(lead as any) }));

    res.status(200).json({ data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ message: 'Internal server error while fetching leads' });
  }
};

export const getLeadById = async (req: AuthRequest, res: Response) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('stageHistory.changedBy', 'firstName lastName email')
      .populate('activityLog.createdBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName')
      .lean();
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    const proposals = await LeadProposal.find({ leadId: lead._id }).populate('packageId', 'name tier').sort({ createdAt: -1 }).lean();
    res.status(200).json({ ...lead, leadScore: calculateLeadScore(lead as any), proposals });
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ message: 'Internal server error while fetching lead' });
  }
};

export const getPipelineSummary = async (_req: AuthRequest, res: Response) => {
  try {
    const agg = await Lead.aggregate([
      { $group: { _id: '$stage', count: { $sum: 1 }, value: { $sum: '$estimatedValue' } } },
    ]);
    const stages = ['LEAD', 'DEMO_SCHEDULED', 'PROPOSAL_SENT', 'QUOTATION_APPROVED', 'WON', 'LOST'];
    const summary = stages.map((stage) => {
      const match = agg.find((a: any) => a._id === stage);
      return { stage, count: match?.count || 0, value: match?.value || 0 };
    });

    // Time-to-confirm: days from lead creation to the stageHistory entry that moved it to
    // WON. Falls back to updatedAt for leads won before stageHistory tracked timestamps.
    const wonLeads = await Lead.find({ stage: 'WON' }).select('createdAt updatedAt stageHistory').lean();
    const daysToWin = wonLeads.map((lead: any) => {
      const wonEntry = (lead.stageHistory || []).find((h: any) => h.toStage === 'WON');
      const wonAt = wonEntry?.changedAt || lead.updatedAt;
      return (new Date(wonAt).getTime() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    });
    const avgDaysToWin = daysToWin.length > 0 ? daysToWin.reduce((s, d) => s + d, 0) / daysToWin.length : 0;

    res.status(200).json({ summary, avgDaysToWin });
  } catch (error) {
    console.error('Error fetching pipeline summary:', error);
    res.status(500).json({ message: 'Internal server error while fetching pipeline summary' });
  }
};

export const createLead = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = leadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const lead = new Lead({
      ...parsed.data,
      ...(req.user?._id && { createdBy: req.user._id }),
      stageHistory: [{ toStage: parsed.data.stage, ...(req.user?._id && { changedBy: req.user._id }), changedAt: new Date() }],
    });
    await lead.save();
    await writeAudit('CREATE_LEAD', req.user?._id, { companyName: lead.companyName });
    res.status(201).json(lead);
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ message: 'Internal server error while creating lead' });
  }
};

export const updateLead = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = leadSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const existing = await Lead.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Lead not found' });

    const stageChanged = parsed.data.stage !== undefined && parsed.data.stage !== existing.stage;

    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      {
        ...parsed.data,
        ...(req.user?._id && { updatedBy: req.user._id }),
        ...(stageChanged && {
          $push: {
            stageHistory: {
              fromStage: existing.stage,
              toStage: parsed.data.stage,
              ...(req.user?._id && { changedBy: req.user._id }),
              changedAt: new Date(),
            },
          },
        }),
      },
      { new: true, runValidators: true },
    );
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    await writeAudit('UPDATE_LEAD', req.user?._id, { companyName: lead.companyName, stage: lead.stage });
    res.status(200).json(lead);
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ message: 'Internal server error while updating lead' });
  }
};

export const deleteLead = async (req: AuthRequest, res: Response) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    await writeAudit('DELETE_LEAD', req.user?._id, { companyName: lead.companyName });
    res.status(200).json({ message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ message: 'Internal server error while deleting lead' });
  }
};

const addNoteSchema = z.object({ note: z.string().trim().min(1, 'Note cannot be empty') });

export const addLeadNote = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = addNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { $push: { activityLog: { note: parsed.data.note, ...(req.user?._id && { createdBy: req.user._id }), createdAt: new Date() } } },
      { new: true },
    );
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    await writeAudit('ADD_LEAD_NOTE', req.user?._id, { companyName: lead.companyName, note: parsed.data.note });
    res.status(201).json(lead);
  } catch (error) {
    console.error('Error adding lead note:', error);
    res.status(500).json({ message: 'Internal server error while adding note' });
  }
};

const proposalItemSchema = z.object({ description: z.string().min(1), amount: z.coerce.number().min(0) });
const generateProposalSchema = z.object({
  items: z.array(proposalItemSchema).min(1, 'At least one line item is required'),
  validDays: z.coerce.number().min(1).optional().default(14),
  packageId: z.string().optional(),
});

export const listLeadProposals = async (req: AuthRequest, res: Response) => {
  try {
    const proposals = await LeadProposal.find({ leadId: req.params.id as string }).sort({ createdAt: -1 }).lean();
    res.status(200).json(proposals);
  } catch (error) {
    console.error('Error listing lead proposals:', error);
    res.status(500).json({ message: 'Internal server error while listing proposals' });
  }
};

export const generateLeadProposal = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = generateProposalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const totalAmount = parsed.data.items.reduce((s, i) => s + i.amount, 0);
    const proposalNumber = await generateProposalNumber();
    const validUntil = new Date(Date.now() + parsed.data.validDays * 24 * 60 * 60 * 1000);

    const preparedBy = req.user ? `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email : undefined;
    const pdfUrl = await buildProposalPdf({
      proposalNumber, companyName: lead.companyName, contactName: lead.contactName, contactEmail: lead.contactEmail,
      items: parsed.data.items, totalAmount, currency: lead.currency, validUntil,
      ...(preparedBy && { preparedBy }),
    });

    const proposal = await LeadProposal.create({
      leadId: lead._id,
      proposalNumber,
      ...(parsed.data.packageId && { packageId: parsed.data.packageId }),
      items: parsed.data.items,
      totalAmount,
      currency: lead.currency,
      status: 'DRAFT',
      validUntil,
      pdfUrl,
      ...(req.user?._id && { createdBy: req.user._id }),
    });

    await writeAudit('GENERATE_LEAD_PROPOSAL', req.user?._id, { companyName: lead.companyName, proposalNumber, totalAmount });
    res.status(201).json(proposal);
  } catch (error) {
    console.error('Error generating lead proposal:', error);
    res.status(500).json({ message: 'Internal server error while generating proposal' });
  }
};

export const sendLeadProposal = async (req: AuthRequest, res: Response) => {
  try {
    const proposal = await LeadProposal.findOne({ _id: req.params.proposalId as string, leadId: req.params.id as string });
    if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const result = await sendMail({
      to: lead.contactEmail,
      subject: `Proposal ${proposal.proposalNumber} from CrewCam HR Cloud`,
      html: `<p>Hi ${lead.contactName},</p><p>Please find your proposal <strong>${proposal.proposalNumber}</strong> from CrewCam HR Cloud.</p><p><a href="${proposal.pdfUrl}">Download Proposal PDF</a></p>`,
    });

    proposal.status = 'SENT';
    proposal.sentAt = new Date();
    await proposal.save();

    const stageChanged = lead.stage !== 'PROPOSAL_SENT';
    if (stageChanged) {
      await Lead.findByIdAndUpdate(lead._id, {
        stage: 'PROPOSAL_SENT',
        $push: { stageHistory: { fromStage: lead.stage, toStage: 'PROPOSAL_SENT', ...(req.user?._id && { changedBy: req.user._id }), changedAt: new Date() } },
      });
    }

    await writeAudit('SEND_LEAD_PROPOSAL', req.user?._id, { companyName: lead.companyName, proposalNumber: proposal.proposalNumber, emailSent: result.sent });
    res.status(200).json({ proposal, emailSent: result.sent, emailError: result.error });
  } catch (error) {
    console.error('Error sending lead proposal:', error);
    res.status(500).json({ message: 'Internal server error while sending proposal' });
  }
};

// ---- Lead master data (Sources / Lost Reasons reference lists) ----

export const getLeadMasterData = async (req: AuthRequest, res: Response) => {
  try {
    const query: any = {};
    if (req.query.type) query.type = req.query.type;
    const data = await LeadMasterData.find(query).sort({ type: 1, value: 1 }).lean();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching lead master data:', error);
    res.status(500).json({ message: 'Internal server error while fetching lead master data' });
  }
};

const masterDataSchema = z.object({
  type: z.enum(['SOURCE', 'LOST_REASON']),
  value: z.string().trim().min(1, 'Value is required'),
});

export const createLeadMasterData = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = masterDataSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const existing = await LeadMasterData.findOne({ type: parsed.data.type, value: parsed.data.value });
    if (existing) return res.status(400).json({ message: 'This value already exists' });

    const entry = await LeadMasterData.create(parsed.data);
    res.status(201).json(entry);
  } catch (error) {
    console.error('Error creating lead master data:', error);
    res.status(500).json({ message: 'Internal server error while creating lead master data' });
  }
};

const updateMasterDataSchema = z.object({
  value: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
});

export const updateLeadMasterData = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateMasterDataSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const entry = await LeadMasterData.findByIdAndUpdate(req.params.id, parsed.data, { new: true });
    if (!entry) return res.status(404).json({ message: 'Entry not found' });
    res.status(200).json(entry);
  } catch (error) {
    console.error('Error updating lead master data:', error);
    res.status(500).json({ message: 'Internal server error while updating lead master data' });
  }
};

export const deleteLeadMasterData = async (req: AuthRequest, res: Response) => {
  try {
    const entry = await LeadMasterData.findByIdAndDelete(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Entry not found' });
    res.status(200).json({ message: 'Entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting lead master data:', error);
    res.status(500).json({ message: 'Internal server error while deleting lead master data' });
  }
};

// ---- Assignable users (platform staff who can be set as a lead's owner) ----

export const getAssignableUsers = async (_req: AuthRequest, res: Response) => {
  try {
    const roles = await Role.find({ permissions: { $in: ['*', 'SUPER_ADMIN'] }, isActive: true })
      .setOptions({ bypassTenantIsolation: true })
      .select('_id')
      .lean();
    const users = await User.find({ roleId: { $in: roles.map((r) => r._id) }, isActive: true })
      .setOptions({ bypassTenantIsolation: true })
      .select('firstName lastName email')
      .sort({ firstName: 1 })
      .lean();
    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching assignable users:', error);
    res.status(500).json({ message: 'Internal server error while fetching assignable users' });
  }
};

// ---- Stats (stat cards, follow-ups due, leads by source, recent activity) ----

export const getLeadStats = async (req: AuthRequest, res: Response) => {
  try {
    const query: any = {};
    if (req.query.stage) {
      const stages = String(req.query.stage).split(',').map((s) => s.trim()).filter(Boolean);
      query.stage = stages.length > 1 ? { $in: stages } : stages[0];
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
    const followUpWindowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [total, today, thisWeek, thisMonth, pendingFollowUps, bySourceAgg, byIndustryAgg, followUpsDue, recentActivitiesAgg] = await Promise.all([
      Lead.countDocuments(query),
      Lead.countDocuments({ ...query, createdAt: { $gte: startOfToday } }),
      Lead.countDocuments({ ...query, createdAt: { $gte: startOfWeek } }),
      Lead.countDocuments({ ...query, createdAt: { $gte: startOfMonth } }),
      Lead.countDocuments({ ...query, $or: [{ followUpDate: null }, { followUpDate: { $lte: now } }] }),
      Lead.aggregate([{ $match: query }, { $group: { _id: '$source', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Lead.aggregate([
        { $match: { ...query, industry: { $exists: true, $nin: [null, ''] } } },
        { $group: { _id: '$industry', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Lead.find({ ...query, followUpDate: { $gte: now, $lte: followUpWindowEnd } })
        .select('companyName followUpDate').sort({ followUpDate: 1 }).limit(6).lean(),
      Lead.aggregate([
        { $match: query },
        { $unwind: '$activityLog' },
        { $sort: { 'activityLog.createdAt': -1 } },
        { $limit: 6 },
        { $project: { companyName: 1, note: '$activityLog.note', createdAt: '$activityLog.createdAt' } },
      ]),
    ]);

    res.status(200).json({
      total,
      today,
      thisWeek,
      thisMonth,
      pendingFollowUps,
      bySource: bySourceAgg.map((s: any) => ({ source: s._id || 'OTHER', count: s.count })),
      byIndustry: byIndustryAgg.map((s: any) => ({ industry: s._id, count: s.count })),
      followUpsDue,
      recentActivities: recentActivitiesAgg,
    });
  } catch (error) {
    console.error('Error fetching lead stats:', error);
    res.status(500).json({ message: 'Internal server error while fetching lead stats' });
  }
};

// ---- Bulk CSV import ----

const bulkLeadRowSchema = leadSchema.partial().extend({
  companyName: z.string().trim().min(2, 'Company name must be at least 2 characters'),
  contactName: z.string().trim().min(1, 'Contact name is required'),
  contactEmail: z.string().trim().email('A valid contact email is required'),
});

export const bulkImportLeads = async (req: AuthRequest, res: Response) => {
  try {
    const rows = Array.isArray(req.body.leads) ? req.body.leads : [];
    if (rows.length === 0) return res.status(400).json({ message: 'No leads provided' });
    if (rows.length > 1000) return res.status(400).json({ message: 'Maximum 1000 leads per import' });

    let created = 0;
    const failed: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const parsed = bulkLeadRowSchema.safeParse(rows[i]);
      if (!parsed.success) {
        failed.push({ row: i + 1, message: parsed.error.issues[0]?.message || 'Invalid row' });
        continue;
      }
      try {
        const lead = new Lead({
          ...parsed.data,
          ...(req.user?._id && { createdBy: req.user._id }),
          stageHistory: [{ toStage: parsed.data.stage || 'LEAD', ...(req.user?._id && { changedBy: req.user._id }), changedAt: new Date() }],
        });
        await lead.save();
        created += 1;
      } catch (err: any) {
        failed.push({ row: i + 1, message: err.message || 'Failed to save' });
      }
    }

    await writeAudit('IMPORT_LEADS', req.user?._id, { created, failedCount: failed.length });
    res.status(201).json({ created, failed });
  } catch (error) {
    console.error('Error importing leads:', error);
    res.status(500).json({ message: 'Internal server error while importing leads' });
  }
};

// ---- Follow-up overview (My Follow-Ups page) ----

export const getFollowUpStats = async (req: AuthRequest, res: Response) => {
  try {
    const baseQuery: any = { followUpDate: { $ne: null }, stage: { $nin: ['WON', 'LOST'] } };
    if (req.query.owner === 'me' && req.user?._id) baseQuery.assignedTo = req.user._id;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const startOfDayAfterTomorrow = new Date(startOfToday.getTime() + 2 * 24 * 60 * 60 * 1000);
    const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
    const endOfMonth = new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [total, overdue, dueToday, dueTomorrow, dueThisWeek, dueThisMonth, overdueLeads] = await Promise.all([
      Lead.countDocuments(baseQuery),
      Lead.countDocuments({ ...baseQuery, followUpDate: { $lt: now } }),
      Lead.countDocuments({ ...baseQuery, followUpDate: { $gte: now, $lt: startOfTomorrow } }),
      Lead.countDocuments({ ...baseQuery, followUpDate: { $gte: startOfTomorrow, $lt: startOfDayAfterTomorrow } }),
      Lead.countDocuments({ ...baseQuery, followUpDate: { $gte: startOfDayAfterTomorrow, $lt: endOfWeek } }),
      Lead.countDocuments({ ...baseQuery, followUpDate: { $gte: now, $lt: endOfMonth } }),
      Lead.find({ ...baseQuery, followUpDate: { $lt: now } })
        .select('companyName followUpDate').sort({ followUpDate: 1 }).limit(10).lean(),
    ]);

    res.status(200).json({ total, overdue, dueToday, dueTomorrow, dueThisWeek, dueThisMonth, overdueLeads });
  } catch (error) {
    console.error('Error fetching follow-up stats:', error);
    res.status(500).json({ message: 'Internal server error while fetching follow-up stats' });
  }
};

// ---- Reminder settings (per-user preference; no automated sending yet) ----

const reminderSettingsSchema = z.object({
  enabled: z.boolean().optional().default(true),
  remindBeforeMinutes: z.coerce.number().min(0).optional().default(60),
  notifyByEmail: z.boolean().optional().default(true),
  notifyByWhatsApp: z.boolean().optional().default(true),
});

export const getReminderSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?._id) return res.status(401).json({ message: 'Not authenticated' });
    const settings = await LeadReminderSettings.findOne({ userId: req.user._id }).lean();
    res.status(200).json(settings || { enabled: true, remindBeforeMinutes: 60, notifyByEmail: true, notifyByWhatsApp: true });
  } catch (error) {
    console.error('Error fetching reminder settings:', error);
    res.status(500).json({ message: 'Internal server error while fetching reminder settings' });
  }
};

export const updateReminderSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?._id) return res.status(401).json({ message: 'Not authenticated' });
    const parsed = reminderSettingsSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const settings = await LeadReminderSettings.findOneAndUpdate(
      { userId: req.user._id },
      { $set: parsed.data },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    res.status(200).json(settings);
  } catch (error) {
    console.error('Error updating reminder settings:', error);
    res.status(500).json({ message: 'Internal server error while updating reminder settings' });
  }
};

// ---- Quick email (follow-up "Send Email" action) ----

const sendLeadEmailSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required'),
  message: z.string().trim().min(1, 'Message is required'),
});

export const sendLeadEmail = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = sendLeadEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const result = await sendMail({
      to: lead.contactEmail,
      subject: parsed.data.subject,
      html: `<p>${parsed.data.message.replace(/\n/g, '<br/>')}</p>`,
    });

    await Lead.findByIdAndUpdate(lead._id, {
      $push: { activityLog: { note: `Email sent: ${parsed.data.subject}`, ...(req.user?._id && { createdBy: req.user._id }), createdAt: new Date() } },
    });

    await writeAudit('SEND_LEAD_EMAIL', req.user?._id, { companyName: lead.companyName, subject: parsed.data.subject, emailSent: result.sent });
    res.status(200).json({ emailSent: result.sent, emailError: result.error });
  } catch (error) {
    console.error('Error sending lead email:', error);
    res.status(500).json({ message: 'Internal server error while sending email' });
  }
};

// ---- Hot leads overview (My Hot Leads page) ----

export const getHotLeadStats = async (_req: AuthRequest, res: Response) => {
  try {
    const hotStages: LeadStage[] = ['PROPOSAL_SENT', 'QUOTATION_APPROVED'];
    const hotLeads = await Lead.find({ stage: { $in: hotStages } })
      .select('companyName stage contactPhone companyEmail companyWebsite industry fullAddress assignedTo followUpDate estimatedValue')
      .lean();

    const total = hotLeads.length;
    const inDiscussion = hotLeads.filter((l) => l.stage === 'PROPOSAL_SENT').length;
    const readyToConvert = hotLeads.filter((l) => l.stage === 'QUOTATION_APPROVED').length;

    const leadIds = hotLeads.map((l) => l._id);
    const proposalSent = await LeadProposal.countDocuments({ leadId: { $in: leadIds }, status: 'SENT' });

    const scored = hotLeads.map((l) => ({ ...l, leadScore: calculateLeadScore(l as any) }));
    const distribution = [
      { label: '90 - 100', count: scored.filter((l) => l.leadScore >= 90).length },
      { label: '80 - 89', count: scored.filter((l) => l.leadScore >= 80 && l.leadScore < 90).length },
      { label: '70 - 79', count: scored.filter((l) => l.leadScore >= 70 && l.leadScore < 80).length },
      { label: 'Below 70', count: scored.filter((l) => l.leadScore < 70).length },
    ];
    const topLeads = scored.slice().sort((a, b) => b.leadScore - a.leadScore).slice(0, 5)
      .map((l) => ({ _id: l._id, companyName: l.companyName, leadScore: l.leadScore }));

    res.status(200).json({ total, inDiscussion, proposalSent, readyToConvert, distribution, topLeads });
  } catch (error) {
    console.error('Error fetching hot lead stats:', error);
    res.status(500).json({ message: 'Internal server error while fetching hot lead stats' });
  }
};

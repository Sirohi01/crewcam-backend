import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Lead } from '../models/Lead';
import { LeadProposal } from '../models/LeadProposal';
import { AuditLog } from '../models/AuditLog';
import { generateProposalNumber, buildProposalPdf } from '../services/billingDocuments';
import { sendMail } from '../services/mailer';
import { z } from 'zod';

const leadSchema = z.object({
  companyName: z.string().trim().min(2, 'Company name must be at least 2 characters'),
  contactName: z.string().trim().min(1, 'Contact name is required'),
  contactEmail: z.string().trim().email('A valid contact email is required'),
  contactPhone: z.string().optional(),
  source: z.enum(['WEBSITE', 'REFERRAL', 'OUTBOUND', 'EVENT', 'OTHER']).optional().default('OTHER'),
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
    if (req.query.stage) query.stage = req.query.stage;
    if (req.query.source) query.source = req.query.source;
    if (req.query.search) {
      const search = new RegExp(String(req.query.search), 'i');
      query.$or = [{ companyName: search }, { contactName: search }, { contactEmail: search }];
    }

    const [leads, total] = await Promise.all([
      Lead.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Lead.countDocuments(query),
    ]);

    res.status(200).json({ data: leads, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ message: 'Internal server error while fetching leads' });
  }
};

export const getLeadById = async (req: AuthRequest, res: Response) => {
  try {
    const lead = await Lead.findById(req.params.id).populate('stageHistory.changedBy', 'firstName lastName email').lean();
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    const proposals = await LeadProposal.find({ leadId: lead._id }).sort({ createdAt: -1 }).lean();
    res.status(200).json({ ...lead, proposals });
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
    res.status(200).json({ summary });
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

const proposalItemSchema = z.object({ description: z.string().min(1), amount: z.coerce.number().min(0) });
const generateProposalSchema = z.object({
  items: z.array(proposalItemSchema).min(1, 'At least one line item is required'),
  validDays: z.coerce.number().min(1).optional().default(14),
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

    const pdfUrl = await buildProposalPdf({
      proposalNumber, companyName: lead.companyName, items: parsed.data.items, totalAmount, currency: lead.currency, validUntil,
    });

    const proposal = await LeadProposal.create({
      leadId: lead._id,
      proposalNumber,
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

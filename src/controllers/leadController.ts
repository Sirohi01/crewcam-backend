import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Lead } from '../models/Lead';
import { AuditLog } from '../models/AuditLog';
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
    const lead = await Lead.findById(req.params.id).lean();
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.status(200).json(lead);
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
    const lead = new Lead({ ...parsed.data, ...(req.user?._id && { createdBy: req.user._id }) });
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
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { ...parsed.data, ...(req.user?._id && { updatedBy: req.user._id }) },
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

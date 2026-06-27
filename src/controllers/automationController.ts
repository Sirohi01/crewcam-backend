import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AutomationRule, AUTOMATION_RULE_TYPES } from '../models/AutomationRule';
import { AutomationLog } from '../models/AutomationLog';
import { runAllAutomationChecks } from '../services/automationService';
import { z } from 'zod';

export const getAutomationRules = async (_req: AuthRequest, res: Response) => {
  try {
    const existing = await AutomationRule.find().lean();
    const byType = new Map(existing.map((r: any) => [r.type, r]));
    const missing = AUTOMATION_RULE_TYPES.filter((t) => !byType.has(t));
    if (missing.length) {
      await AutomationRule.insertMany(missing.map((type) => ({ type })));
    }
    const rules = missing.length ? await AutomationRule.find().lean() : existing;
    res.status(200).json(rules);
  } catch (error) {
    console.error('Error fetching automation rules:', error);
    res.status(500).json({ message: 'Internal server error while fetching automation rules' });
  }
};

const updateRuleSchema = z.object({
  isEnabled: z.boolean().optional(),
  intervalDays: z.coerce.number().min(1).optional(),
  threshold: z.coerce.number().min(0).optional(),
});

export const updateAutomationRule = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const type = req.params.type as string;
    if (!AUTOMATION_RULE_TYPES.includes(type as any)) {
      return res.status(400).json({ message: 'Unknown automation rule type' });
    }
    const rule = await AutomationRule.findOneAndUpdate({ type } as any, parsed.data, { new: true, upsert: true });
    res.status(200).json(rule);
  } catch (error) {
    console.error('Error updating automation rule:', error);
    res.status(500).json({ message: 'Internal server error while updating automation rule' });
  }
};

export const getAutomationLogs = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (req.query.type) query.type = req.query.type;
    if (req.query.status) query.status = req.query.status;

    const [logs, total] = await Promise.all([
      AutomationLog.find(query)
        .populate('tenantId', 'name')
        .populate('leadId', 'companyName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AutomationLog.countDocuments(query),
    ]);

    res.status(200).json({ data: logs, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Error fetching automation logs:', error);
    res.status(500).json({ message: 'Internal server error while fetching automation logs' });
  }
};

export const runAutomationNow = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await runAllAutomationChecks();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error running automation checks:', error);
    res.status(500).json({ message: 'Internal server error while running automation checks' });
  }
};

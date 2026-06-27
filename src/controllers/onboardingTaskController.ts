import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { OnboardingTask } from '../models/OnboardingTask';
import { Tenant } from '../models/Tenant';
import { AuditLog } from '../models/AuditLog';
import { z } from 'zod';

const taskSchema = z.object({
  tenantId: z.string().min(1, 'A company must be selected'),
  category: z.enum(['IMPLEMENTATION', 'DEPLOYMENT']),
  title: z.string().trim().min(2, 'Title must be at least 2 characters'),
  description: z.string().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'BLOCKED']).optional().default('PENDING'),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
});

async function writeAudit(action: string, userId: any, tenantId: string, details: Record<string, any>) {
  try {
    await AuditLog.create({ tenantId, userId, action, module: 'Onboarding', status: 'SUCCESS', details } as any);
  } catch (err) {
    console.error('[audit] failed to write onboarding task audit log:', err);
  }
}

export const getOnboardingTasks = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (req.query.category) query.category = req.query.category;
    if (req.query.status) query.status = req.query.status;
    if (req.query.tenantId) query.tenantId = req.query.tenantId;

    const [tasks, total] = await Promise.all([
      OnboardingTask.find(query).populate('tenantId', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      OnboardingTask.countDocuments(query),
    ]);

    let filtered = tasks;
    if (req.query.search) {
      const search = String(req.query.search).toLowerCase();
      filtered = tasks.filter((t: any) => t.title?.toLowerCase().includes(search) || (t.tenantId?.name || '').toLowerCase().includes(search));
    }

    res.status(200).json({ data: filtered, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Error fetching onboarding tasks:', error);
    res.status(500).json({ message: 'Internal server error while fetching onboarding tasks' });
  }
};

export const createOnboardingTask = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = taskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const tenant = await Tenant.findById(parsed.data.tenantId);
    if (!tenant) return res.status(400).json({ message: 'Selected company does not exist' });

    const task = new OnboardingTask({ ...parsed.data, ...(req.user?._id && { createdBy: req.user._id }) });
    await task.save();
    await writeAudit('CREATE_ONBOARDING_TASK', req.user?._id, parsed.data.tenantId, { title: task.title, category: task.category });
    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating onboarding task:', error);
    res.status(500).json({ message: 'Internal server error while creating onboarding task' });
  }
};

export const updateOnboardingTask = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = taskSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const updatePayload: any = { ...parsed.data, ...(req.user?._id && { updatedBy: req.user._id }) };
    if (parsed.data.status === 'DONE') updatePayload.completedAt = new Date();

    const task = await OnboardingTask.findByIdAndUpdate(req.params.id, updatePayload, { new: true, runValidators: true });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    await writeAudit('UPDATE_ONBOARDING_TASK', req.user?._id, String(task.tenantId), { title: task.title, status: task.status });
    res.status(200).json(task);
  } catch (error) {
    console.error('Error updating onboarding task:', error);
    res.status(500).json({ message: 'Internal server error while updating onboarding task' });
  }
};

export const deleteOnboardingTask = async (req: AuthRequest, res: Response) => {
  try {
    const task = await OnboardingTask.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    await writeAudit('DELETE_ONBOARDING_TASK', req.user?._id, String(task.tenantId), { title: task.title });
    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting onboarding task:', error);
    res.status(500).json({ message: 'Internal server error while deleting onboarding task' });
  }
};

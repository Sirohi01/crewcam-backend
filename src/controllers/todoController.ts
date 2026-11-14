import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { getEffectivePermissions } from '../middleware/rbac';
import { Todo } from '../models/Todo';
import { User } from '../models/User';
import { notifyUser } from './communicationController';

const blank = (v: unknown) => (v === '' || v === null ? undefined : v);

const TASK_FIELDS = {
  title: z.string().trim().min(1).max(200),
  description: z.preprocess(blank, z.string().trim().max(2000).optional()),
  dueDate: z.preprocess(blank, z.coerce.date().optional()),
  priority: z.enum(['Low', 'Medium', 'High']).optional(),
  relatedTo: z.preprocess(blank, z.string().trim().max(120).optional()),
};
const CREATE_SCHEMA = z.object(TASK_FIELDS);
const ASSIGN_SCHEMA = z.object({ ...TASK_FIELDS, assigneeId: z.string().regex(/^[a-f\d]{24}$/i, 'invalid employee') });
const UPDATE_SCHEMA = z.object({
  ...TASK_FIELDS,
  title: TASK_FIELDS.title.optional(),
  status: z.enum(['Pending', 'In_Progress', 'Completed']).optional(),
});

const invalid = (res: Response, error: z.ZodError) => res.status(400).json({ message: 'Invalid task', errors: error.issues });
const isDelegated = (todo: any, userId: unknown) => !!todo.assignedBy && String(todo.assignedBy) !== String(userId);

export const createTodo = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const parsed = CREATE_SCHEMA.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);

    const todo = await Todo.create({ ...parsed.data, tenantId, userId: req.user._id });
    res.status(201).json({ message: 'Task added', todo });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating task', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

/**
 * Delegate a task to a colleague. Allowed for the assignee's reporting manager, or for
 * anyone with EMPLOYEE_WRITE (HR). The assignee is notified and can update the task's
 * status, but only the delegator's wording stands — they can't rewrite or delete it.
 */
export const assignTodo = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const parsed = ASSIGN_SCHEMA.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const { assigneeId, ...fields } = parsed.data;

    if (assigneeId === String(req.user._id)) return res.status(400).json({ message: 'Use Add Task for your own tasks' });
    const assignee = await User.findOne({ _id: assigneeId, tenantId, isActive: true } as any).select('reportingToId firstName');
    if (!assignee) return res.status(404).json({ message: 'Employee not found' });

    const isManager = String(assignee.reportingToId || '') === String(req.user._id);
    if (!isManager) {
      const perms = await getEffectivePermissions(req);
      if (!perms.some((p) => p === '*' || p === 'EMPLOYEE_WRITE')) {
        return res.status(403).json({ message: 'You can only assign tasks to people who report to you' });
      }
    }

    const todo = await Todo.create({ ...fields, tenantId, userId: assignee._id, assignedBy: req.user._id });
    await notifyUser(tenantId, assignee._id, req.user._id, 'New task assigned',
      `${req.user.firstName || 'Your manager'} assigned you "${fields.title}".`, '/dashboard/my-tasks');

    res.status(201).json({ message: 'Task assigned', todo });
  } catch (error: any) {
    res.status(500).json({ message: 'Error assigning task', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getMyTodos = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const todos = await Todo.find({ tenantId, userId: req.user._id } as any)
      .populate('assignedBy', 'firstName lastName')
      .sort({ status: 1, dueDate: 1, createdAt: -1 });
    res.status(200).json(todos);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching tasks', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const updateTodo = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const parsed = UPDATE_SCHEMA.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);

    const filter = { _id: req.params.id, tenantId, userId: req.user._id } as any;
    const existing = await Todo.findOne(filter);
    if (!existing) return res.status(404).json({ message: 'Task not found' });

    const { status, ...fields } = parsed.data;
    if (isDelegated(existing, req.user._id) && Object.values(fields).some((v) => v !== undefined)) {
      return res.status(403).json({ message: 'Assigned tasks can only have their status changed' });
    }

    const set: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    const unset: Record<string, 1> = {};
    if (status) {
      set.status = status;
      if (status === 'Completed') set.completedAt = new Date();
      else unset.completedAt = 1;
    }

    const todo = await Todo.findOneAndUpdate(
      filter,
      { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { returnDocument: 'after', runValidators: true }
    );
    if (!todo) return res.status(404).json({ message: 'Task not found' });

    if (status === 'Completed' && existing.status !== 'Completed' && isDelegated(existing, req.user._id)) {
      await notifyUser(tenantId, existing.assignedBy, req.user._id, 'Task completed',
        `${req.user.firstName || 'An employee'} completed "${existing.title}".`);
    }
    res.status(200).json({ message: 'Task updated', todo });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating task', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const deleteTodo = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const filter = { _id: req.params.id, tenantId, userId: req.user._id } as any;
    const existing = await Todo.findOne(filter);
    if (!existing) return res.status(404).json({ message: 'Task not found' });
    if (isDelegated(existing, req.user._id)) {
      return res.status(403).json({ message: 'Assigned tasks cannot be deleted — mark them completed instead' });
    }
    await Todo.deleteOne(filter);
    res.status(200).json({ message: 'Task deleted' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting task', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

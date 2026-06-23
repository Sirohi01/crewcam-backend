import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Todo } from '../models/Todo';

export const createTodo = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const { title, description, dueDate, priority } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });

    const todo = await Todo.create({
      tenantId,
      userId: req.user._id,
      title,
      description,
      dueDate,
      priority,
    });

    res.status(201).json({ message: 'Task added', todo });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating task', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getMyTodos = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const todos = await Todo.find({ tenantId, userId: req.user._id } as any).sort({ status: 1, dueDate: 1, createdAt: -1 });
    res.status(200).json(todos);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching tasks', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const updateTodo = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const { id } = req.params;
    const { title, description, dueDate, priority, status } = req.body;
    const update: any = { title, description, dueDate, priority, status };
    if (status === 'Completed') update.completedAt = new Date();
    if (status === 'Pending') update.completedAt = undefined;

    const todo = await Todo.findOneAndUpdate(
      { _id: id, tenantId, userId: req.user._id } as any,
      { $set: update },
      { returnDocument: 'after', runValidators: true }
    );

    if (!todo) return res.status(404).json({ message: 'Task not found' });
    res.status(200).json({ message: 'Task updated', todo });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating task', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const deleteTodo = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const { id } = req.params;
    const todo = await Todo.findOneAndDelete({ _id: id, tenantId, userId: req.user._id } as any);
    if (!todo) return res.status(404).json({ message: 'Task not found' });
    res.status(200).json({ message: 'Task deleted' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting task', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

export interface ITodo extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  description?: string;
  dueDate?: Date;
  priority: 'Low' | 'Medium' | 'High';
  status: 'Pending' | 'In_Progress' | 'Completed';
  completedAt?: Date;
  assignedBy?: Types.ObjectId; // set when someone else (manager/HR) delegated the task
  relatedTo?: string;
}

const todoSchema = new Schema<ITodo>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  description: { type: String },
  dueDate: { type: Date },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  status: { type: String, enum: ['Pending', 'In_Progress', 'Completed'], default: 'Pending' },
  completedAt: { type: Date },
  assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  relatedTo: { type: String, trim: true },
}, { timestamps: true });

todoSchema.plugin(tenantPlugin);

export const Todo = mongoose.model<ITodo>('Todo', todoSchema);

import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';
import { auditPlugin } from './plugins/auditPlugin';

export interface ITraining extends Document {
  tenantId: Types.ObjectId;
  employeeId: Types.ObjectId;
  courseId: Types.ObjectId;
  status: 'Not_Started' | 'In_Progress' | 'Completed';
  completionDate?: Date;
  score?: number; // Optional quiz score
  completedModules: string[]; // Array of module _ids that have been completed
}

const trainingSchema = new Schema<ITraining>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
  status: { 
    type: String, 
    enum: ['Not_Started', 'In_Progress', 'Completed'], 
    default: 'Not_Started' 
  },
  completionDate: { type: Date },
  score: { type: Number },
  completedModules: [{ type: String }]
}, {
  timestamps: true
});

trainingSchema.plugin(tenantPlugin);
trainingSchema.plugin(auditPlugin);

export const Training = mongoose.model<ITraining>('Training', trainingSchema);

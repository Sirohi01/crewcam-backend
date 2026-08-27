import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IInductionForm extends ITenantScoped {
  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  employeeName?: string;
  uniqueId?: string;
  designation?: string;
  department?: string;
  joiningDate?: string;
  inductionDate?: Date;
  modules: {
    moduleName: string;
    conductedBy?: Types.ObjectId;
    completed: boolean;
    completedDate?: Date;
  }[];
  overallStatus: 'Scheduled' | 'InProgress' | 'Completed';
  feedback?: string;
}

const inductionFormSchema = new Schema<IInductionForm>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  employeeName: { type: String },
  uniqueId: { type: String },
  designation: { type: String },
  department: { type: String },
  joiningDate: { type: String },
  inductionDate: { type: Date },
  modules: [{
    moduleName: { type: String, required: true },
    conductedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    completed: { type: Boolean, default: false },
    completedDate: { type: Date }
  }],
  overallStatus: { type: String, enum: ['Scheduled', 'InProgress', 'Completed'], default: 'Scheduled' },
  feedback: { type: String }
}, { timestamps: true });

inductionFormSchema.plugin(tenantPlugin);

export const InductionForm = mongoose.model<IInductionForm>('InductionForm', inductionFormSchema);

import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IAppointmentLetter extends ITenantScoped {
  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  designation: string;
  departmentId?: Types.ObjectId;
  ctc?: number;
  joiningDate?: Date;
  probationPeriodMonths: number;
  letterContent?: string;
  pdfUrl?: string;
  status: 'Draft' | 'Issued' | 'Acknowledged';
  issuedDate?: Date;
  acknowledgedDate?: Date;
  issuedBy: Types.ObjectId;
}

const appointmentLetterSchema = new Schema<IAppointmentLetter>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  designation: { type: String, required: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
  ctc: { type: Number },
  joiningDate: { type: Date },
  probationPeriodMonths: { type: Number, default: 6 },
  letterContent: { type: String },
  pdfUrl: { type: String },
  status: { type: String, enum: ['Draft', 'Issued', 'Acknowledged'], default: 'Draft' },
  issuedDate: { type: Date },
  acknowledgedDate: { type: Date },
  issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

appointmentLetterSchema.plugin(tenantPlugin);

export const AppointmentLetter = mongoose.model<IAppointmentLetter>('AppointmentLetter', appointmentLetterSchema);

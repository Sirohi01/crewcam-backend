import mongoose, { Schema, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IAppointmentLetter extends ITenantScoped {
  date?: string;
  candidateName?: string;
  dearName?: string;
  department?: string;
  position?: string;
  commencementDate?: string;
  reportingTime?: string;
  reportingLocation?: string;
  monthlyCTC?: string;
  annualCTC?: string;
  probationPeriod?: string;
  workingHoursStart?: string;
  subject?: string;

  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;

  // Role & placement
  designation: string;
  departmentId?: Types.ObjectId;
  departmentName?: string;
  reportingTo?: string;
  workLocation?: string;

  // Dates
  joiningDate?: Date;
  probationPeriodMonths: number;
  probationEndDate?: Date;

  // Compensation
  ctc?: number;
  ctcInWords?: string;
  paymentMode?: string;

  // Working hours
  workingHours?: string;
  workingDays?: string;
  weeklyOff?: string;

  // Letter content (saved snapshot)
  letterContent?: string;

  // Acknowledgement
  acknowledgedByName?: string;
  acknowledgedBySignature?: string;

  // PDF & workflow
  pdfUrl?: string;
  status: 'Draft' | 'Issued' | 'Acknowledged';
  issuedDate?: Date;
  acknowledgedDate?: Date;
  issuedBy: Types.ObjectId;
}

const appointmentLetterSchema = new Schema<IAppointmentLetter>({
  date: { type: String },
  candidateName: { type: String },
  dearName: { type: String },
  department: { type: String },
  position: { type: String },
  commencementDate: { type: String },
  reportingTime: { type: String },
  reportingLocation: { type: String },
  monthlyCTC: { type: String },
  annualCTC: { type: String },
  probationPeriod: { type: String },
  workingHoursStart: { type: String },
  subject: { type: String },

  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },

  designation: { type: String, required: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
  departmentName: { type: String },
  reportingTo: { type: String },
  workLocation: { type: String },

  joiningDate: { type: Date },
  probationPeriodMonths: { type: Number, default: 6 },
  probationEndDate: { type: Date },

  ctc: { type: Number },
  ctcInWords: { type: String },
  paymentMode: { type: String },

  workingHours: { type: String },
  workingDays: { type: String },
  weeklyOff: { type: String },

  letterContent: { type: String },

  acknowledgedByName: { type: String },
  acknowledgedBySignature: { type: String },

  pdfUrl: { type: String },
  status: { type: String, enum: ['Draft', 'Issued', 'Acknowledged'], default: 'Draft' },
  issuedDate: { type: Date },
  acknowledgedDate: { type: Date },
  issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

appointmentLetterSchema.plugin(tenantPlugin);

export const AppointmentLetter = mongoose.model<IAppointmentLetter>('AppointmentLetter', appointmentLetterSchema);

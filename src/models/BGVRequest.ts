import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IBGVRequest extends ITenantScoped {
  fullName?: string;
  joiningDate?: string;
  positionFor?: string;
  homeNo?: string;
  department?: string;
  alternateNo?: string;
  reportingTo?: string;
  workLocation?: string;
  emailId?: string;
  mobileNo?: string;
  currentAddress?: string;
  currentState?: string;
  currentCityPin?: string;
  currentCountry?: string;
  permanentAddress?: string;
  permanentState?: string;
  permanentCityPin?: string;
  permanentCountry?: string;
  requestDesignation?: string;
  priorityLevel?: string;
  reportCandidateName?: string;
  reportDOJ?: string;
  reportEmpCode?: string;
  reportDepartment?: string;

  candidateId?: Types.ObjectId;
  employeeId?: Types.ObjectId;
  vendor?: string;
  requestedBy: Types.ObjectId;
  requestDate: Date;
  checksRequested: string[];
  status: 'Initiated' | 'InProgress' | 'Completed' | 'Flagged';
  reportUrl?: string;
  overallResult?: 'Clear' | 'Discrepancy' | 'Pending';
  discrepancyDetails?: string;
  completedDate?: Date;
}

const bgvRequestSchema = new Schema<IBGVRequest>({
  fullName: { type: String },
  joiningDate: { type: String },
  positionFor: { type: String },
  homeNo: { type: String },
  department: { type: String },
  alternateNo: { type: String },
  reportingTo: { type: String },
  workLocation: { type: String },
  emailId: { type: String },
  mobileNo: { type: String },
  currentAddress: { type: String },
  currentState: { type: String },
  currentCityPin: { type: String },
  currentCountry: { type: String },
  permanentAddress: { type: String },
  permanentState: { type: String },
  permanentCityPin: { type: String },
  permanentCountry: { type: String },
  requestDesignation: { type: String },
  priorityLevel: { type: String },
  reportCandidateName: { type: String },
  reportDOJ: { type: String },
  reportEmpCode: { type: String },
  reportDepartment: { type: String },

  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate' },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  vendor: { type: String },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  requestDate: { type: Date, default: Date.now },
  checksRequested: [{ type: String }],
  status: { type: String, enum: ['Initiated', 'InProgress', 'Completed', 'Flagged'], default: 'Initiated' },
  reportUrl: { type: String },
  overallResult: { type: String, enum: ['Clear', 'Discrepancy', 'Pending'], default: 'Pending' },
  discrepancyDetails: { type: String },
  completedDate: { type: Date }
}, { timestamps: true });

bgvRequestSchema.plugin(tenantPlugin);

export const BGVRequest = mongoose.model<IBGVRequest>('BGVRequest', bgvRequestSchema);

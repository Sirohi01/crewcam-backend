import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface ITeamIntro extends ITenantScoped {
  candidateName?: string;
  position?: string;
  department?: string;
  reportingTo?: string;
  joiningDate?: string;
  effectiveDate?: string;

  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  teamMembers: {
    userId?: Types.ObjectId;
    name: string;
    designation?: string;
  }[];
  introductionNote?: string;
  sentBy: Types.ObjectId;
  sentDate?: Date;
}

const teamIntroSchema = new Schema<ITeamIntro>({
  candidateName: { type: String },
  position: { type: String },
  department: { type: String },
  reportingTo: { type: String },
  joiningDate: { type: String },
  effectiveDate: { type: String },

  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  teamMembers: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true },
    designation: { type: String }
  }],
  introductionNote: { type: String },
  sentBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sentDate: { type: Date }
}, { timestamps: true });

teamIntroSchema.plugin(tenantPlugin);

export const TeamIntro = mongoose.model<ITeamIntro>('TeamIntro', teamIntroSchema);

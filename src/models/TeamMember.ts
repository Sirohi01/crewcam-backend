import mongoose, {
  Schema,
  Document,
  Types,
} from 'mongoose';

export interface ITeamMember extends Document {
  tenantId?: Types.ObjectId;

  firstName: string;
  lastName: string;

  employeeId: string;

  designation: string;
  role: string;

  email: string;
  mobile: string;

  status: 'Active' | 'Inactive';

  employmentType:
    | 'Full-Time'
    | 'Part-Time'
    | 'Contract';

  avatarUrl?: string;

  department?: string;
  departmentId?: Types.ObjectId;

  subDepartment?: string;

  reportingTo?: string;

  joiningDate?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_REGEX = /^[0-9+\-\s]{7,15}$/;

const TeamMemberSchema =
  new Schema<ITeamMember>(
    {
      tenantId: {
        type: Schema.Types.ObjectId,
        ref: 'Tenant',
        index: true,
      },

      firstName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
      },

      lastName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
      },

      employeeId: {
        type: String,
        required: true,
        trim: true,
        maxlength: 40,
      },

      designation: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },

      role: {
        type: String,
        required: true,
        trim: true,
        maxlength: 60,
      },

      email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        match: [EMAIL_REGEX, 'Please enter a valid email address'],
      },

      mobile: {
        type: String,
        required: true,
        trim: true,
        match: [MOBILE_REGEX, 'Please enter a valid mobile number'],
      },

      status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active',
        index: true,
      },

      employmentType: {
        type: String,
        enum: [
          'Full-Time',
          'Part-Time',
          'Contract',
        ],
        default: 'Full-Time',
      },

      avatarUrl: {
        type: String,
        trim: true,
      },

      department: {
        type: String,
        trim: true,
      },

      departmentId: {
        type: Schema.Types.ObjectId,
        ref: 'Department',
      },

      subDepartment: {
        type: String,
        trim: true,
        index: true,
      },

      reportingTo: {
        type: String,
        trim: true,
      },

      joiningDate: Date,
    },
    {
      timestamps: true,
    }
  );

// employeeId and email must be unique *within a tenant* (not globally —
// otherwise two different companies could never share an employeeId/email).
// If tenantId is not in use yet (single-tenant deployment), this still works
// correctly since tenantId will be the same/undefined for every document.
TeamMemberSchema.index(
  { tenantId: 1, employeeId: 1 },
  { unique: true }
);
TeamMemberSchema.index(
  { tenantId: 1, email: 1 },
  { unique: true }
);

TeamMemberSchema.index({ subDepartment: 1, status: 1 });
TeamMemberSchema.index({ subDepartment: 1, role: 1 });
TeamMemberSchema.index({ firstName: 'text', lastName: 'text', employeeId: 'text', email: 'text' });

export default mongoose.model<ITeamMember>(
  'TeamMember',
  TeamMemberSchema
);
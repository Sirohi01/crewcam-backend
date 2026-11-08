import mongoose, { Schema, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

/**
 * Self-service profile sections that don't belong on User itself: family, emergency
 * contacts, education, certifications, courses, work experience and skills. One
 * document per employee, edited by the employee through /api/v1/me (Phase 1).
 */

export interface IFamilyMember {
  name: string;
  relationship: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
  occupation?: string;
  mobile?: string;
  email?: string;
  isDependent: boolean;
}

export interface IEmergencyContactEntry {
  name: string;
  relationship: string;
  mobile: string;
  alternateMobile?: string;
  address?: string;
  isPrimary: boolean;
}

export interface IFamilyInfo {
  familyStatus?: string;
  spouseName?: string;
  marriageAnniversary?: Date;
  familyAddress?: string;
  medicalHistory?: string;
  nomineeName?: string;
  nomineeRelationship?: string;
}

export interface IEducationEntry {
  qualification: string;
  institution: string;
  board?: string;
  yearOfPassing?: number;
  score?: string;
  mode?: 'Full-Time' | 'Part-Time' | 'Distance' | 'Online';
  specialization?: string;
  documentUrl?: string;
}

export interface ICertificationEntry {
  name: string;
  issuedBy?: string;
  issueDate?: Date;
  expiryDate?: Date;
  credentialId?: string;
  documentUrl?: string;
}

export interface ICourseEntry {
  name: string;
  provider?: string;
  year?: number;
  duration?: string;
  documentUrl?: string;
}

export interface IExperienceEntry {
  company: string;
  designation: string;
  startDate?: Date;
  endDate?: Date;
  location?: string;
  employmentType?: string;
  responsibilities?: string;
}

export interface ISkillEntry {
  name: string;
  category?: string;
  level?: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  yearsOfExperience?: number;
}

export interface IEmployeeProfileDetail extends ITenantScoped, IAuditable {
  userId: Types.ObjectId;
  familyMembers: IFamilyMember[];
  emergencyContacts: IEmergencyContactEntry[];
  familyInfo: IFamilyInfo;
  education: IEducationEntry[];
  certifications: ICertificationEntry[];
  courses: ICourseEntry[];
  experience: IExperienceEntry[];
  skills: ISkillEntry[];
}

// Sub-documents keep their own _id so the UI can edit/delete a single row.
const familyMemberSchema = new Schema<IFamilyMember>({
  name: { type: String, required: true, trim: true },
  relationship: { type: String, required: true, trim: true },
  dateOfBirth: { type: Date },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  occupation: { type: String, trim: true },
  mobile: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  isDependent: { type: Boolean, default: false },
});

const emergencyContactSchema = new Schema<IEmergencyContactEntry>({
  name: { type: String, required: true, trim: true },
  relationship: { type: String, required: true, trim: true },
  mobile: { type: String, required: true, trim: true },
  alternateMobile: { type: String, trim: true },
  address: { type: String, trim: true },
  isPrimary: { type: Boolean, default: false },
});

const educationSchema = new Schema<IEducationEntry>({
  qualification: { type: String, required: true, trim: true },
  institution: { type: String, required: true, trim: true },
  board: { type: String, trim: true },
  yearOfPassing: { type: Number },
  score: { type: String, trim: true },
  mode: { type: String, enum: ['Full-Time', 'Part-Time', 'Distance', 'Online'] },
  specialization: { type: String, trim: true },
  documentUrl: { type: String },
});

const certificationSchema = new Schema<ICertificationEntry>({
  name: { type: String, required: true, trim: true },
  issuedBy: { type: String, trim: true },
  issueDate: { type: Date },
  expiryDate: { type: Date },
  credentialId: { type: String, trim: true },
  documentUrl: { type: String },
});

const courseSchema = new Schema<ICourseEntry>({
  name: { type: String, required: true, trim: true },
  provider: { type: String, trim: true },
  year: { type: Number },
  duration: { type: String, trim: true },
  documentUrl: { type: String },
});

const experienceSchema = new Schema<IExperienceEntry>({
  company: { type: String, required: true, trim: true },
  designation: { type: String, required: true, trim: true },
  startDate: { type: Date },
  endDate: { type: Date },
  location: { type: String, trim: true },
  employmentType: { type: String, trim: true },
  responsibilities: { type: String, trim: true },
});

const skillSchema = new Schema<ISkillEntry>({
  name: { type: String, required: true, trim: true },
  category: { type: String, trim: true },
  level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'] },
  yearsOfExperience: { type: Number, min: 0 },
});

const EmployeeProfileDetailSchema = new Schema<IEmployeeProfileDetail>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    familyMembers: { type: [familyMemberSchema], default: [] },
    emergencyContacts: { type: [emergencyContactSchema], default: [] },
    familyInfo: {
      familyStatus: { type: String, trim: true },
      spouseName: { type: String, trim: true },
      marriageAnniversary: { type: Date },
      familyAddress: { type: String, trim: true },
      medicalHistory: { type: String, trim: true },
      nomineeName: { type: String, trim: true },
      nomineeRelationship: { type: String, trim: true },
    },
    education: { type: [educationSchema], default: [] },
    certifications: { type: [certificationSchema], default: [] },
    courses: { type: [courseSchema], default: [] },
    experience: { type: [experienceSchema], default: [] },
    skills: { type: [skillSchema], default: [] },
  },
  { timestamps: true }
);

EmployeeProfileDetailSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

EmployeeProfileDetailSchema.plugin(tenantPlugin);
EmployeeProfileDetailSchema.plugin(auditPlugin);

export const EmployeeProfileDetail = mongoose.model<IEmployeeProfileDetail>('EmployeeProfileDetail', EmployeeProfileDetailSchema);

import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IUser extends ITenantScoped, IAuditable {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  profilePictureUrl?: string;
  roleId?: mongoose.Types.ObjectId;
  branchId?: mongoose.Types.ObjectId;
  departmentId?: mongoose.Types.ObjectId;
  designationId?: mongoose.Types.ObjectId;
  // Free-text job title captured at account creation (e.g. via the super-admin company
  // wizard), before the user is assigned into the org chart via designationId.
  designation?: string;
  reportingToId?: mongoose.Types.ObjectId;
  employeeCode?: string;
  mobileNumber?: string;
  dateOfJoining?: Date;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
  bloodGroup?: string;
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed';
  currentAddress?: string;
  currentPincode?: string;
  currentCity?: string;
  currentState?: string;
  currentCountry?: string;
  permanentAddress?: string;
  permanentPincode?: string;
  permanentCity?: string;
  permanentState?: string;
  permanentCountry?: string;
  panNumber?: string;
  aadhaarNumber?: string;
  uanNumber?: string;
  emergencyContactName?: string;
  emergencyContactRelation?: string;
  emergencyContactNumber?: string;
  attendanceRuleId?: mongoose.Types.ObjectId;
  policyId?: mongoose.Types.ObjectId;
  policyIds?: mongoose.Types.ObjectId[];
  holidayGroupId?: mongoose.Types.ObjectId;
  holidayGroupIds?: mongoose.Types.ObjectId[];
  shiftTimingId?: mongoose.Types.ObjectId;
  allocatedInventoryIds?: mongoose.Types.ObjectId[];
  jobLevelId?: mongoose.Types.ObjectId;
  employmentStatus: 'active' | 'ex';
  isActive: boolean;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  failedLoginAttempts: number;
  lockoutUntil?: Date;
}

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  profilePictureUrl: { type: String },
  roleId: { type: Schema.Types.ObjectId, ref: 'Role' },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
  designationId: { type: Schema.Types.ObjectId, ref: 'Designation' },
  designation: { type: String },
  reportingToId: { type: Schema.Types.ObjectId, ref: 'User' },
  employeeCode: { type: String, index: true },
  mobileNumber: { type: String },
  dateOfJoining: { type: Date },
  dateOfBirth: { type: Date },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  bloodGroup: { type: String },
  maritalStatus: { type: String, enum: ['single', 'married', 'divorced', 'widowed'] },
  currentAddress: { type: String },
  currentPincode: { type: String },
  currentCity: { type: String },
  currentState: { type: String },
  currentCountry: { type: String, default: 'India' },
  permanentAddress: { type: String },
  permanentPincode: { type: String },
  permanentCity: { type: String },
  permanentState: { type: String },
  permanentCountry: { type: String, default: 'India' },
  panNumber: { type: String },
  aadhaarNumber: { type: String },
  uanNumber: { type: String },
  emergencyContactName: { type: String },
  emergencyContactRelation: { type: String },
  emergencyContactNumber: { type: String },
  attendanceRuleId: { type: Schema.Types.ObjectId, ref: 'AttendanceRule' },
  policyId: { type: Schema.Types.ObjectId, ref: 'Policy' },
  policyIds: [{ type: Schema.Types.ObjectId, ref: 'Policy' }],
  holidayGroupId: { type: Schema.Types.ObjectId, ref: 'Holiday' },
  holidayGroupIds: [{ type: Schema.Types.ObjectId, ref: 'Holiday' }],
  shiftTimingId: { type: Schema.Types.ObjectId, ref: 'ShiftTiming' },
  allocatedInventoryIds: [{ type: Schema.Types.ObjectId, ref: 'ITInventory' }],
  jobLevelId: { type: Schema.Types.ObjectId, ref: 'Level' },
  employmentStatus: { type: String, enum: ['active', 'ex'], default: 'active' },
  isActive: { type: Boolean, default: true },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String },
  failedLoginAttempts: { type: Number, default: 0 },
  lockoutUntil: { type: Date },
}, { timestamps: true });

// Plugins
UserSchema.plugin(tenantPlugin);
UserSchema.plugin(auditPlugin);

export const User = mongoose.model<IUser>('User', UserSchema);

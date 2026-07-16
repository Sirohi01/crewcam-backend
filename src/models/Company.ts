import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface ICompany extends ITenantScoped, IAuditable {
  legalName: string;
  tradeName?: string;
  industry?: string;
  incorporationDate?: Date;
  companyType?: string;
  website?: string;
  logoUrl?: string;
  // Extra factor an admin enters on the Employer Login screen, in addition to the subdomain,
  // to confirm they're signing into the right company workspace.
  corporateId?: string;
  documentHeaderImageUrl?: string;
  documentFooterText?: string;
  founderName?: string;

  // Contact & Address
  email: string;
  phone: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  timezone?: string;
  baseCurrency?: string;
  financialYearStartMonth?: number;
  panNumber?: string;
  gstin?: string;
  cin?: string;
  tan?: string;
  epfoNumber?: string;
  esicNumber?: string;
  ptNumber?: string;
  lwfNumber?: string;
  tin?: string;
  ein?: string;
  vatNumber?: string;
  businessLicenseNumber?: string;

  companySize?: string;
  description?: string;

  // // Sales/onboarding contacts — distinct from the actual login account, which is created
  // // separately (see pendingAdmin* below) once the lifecycle reaches ADMIN_CREDENTIALS_GENERATED.
  ownerName?: string;
  hrName?: string;
  alternatePhone?: string;
  alternateEmail?: string;
  whatsappNumber?: string;
  preferredLanguage?: string;
  supportEmail?: string;
  supportPhone?: string;
  linkedInUrl?: string;

  pendingAdminFirstName?: string;
  pendingAdminLastName?: string;
  pendingAdminEmail?: string;
  pendingAdminPhone?: string;

  selectedModules: string[];
  addonModules?: string[];

  documents?: {
    incorporationCertUrl?: string;
    gstCertUrl?: string;
    panCardUrl?: string;
    otherDocumentUrl?: string;
  };

  notificationPreferences?: {
    biometric?: boolean;
    sso?: boolean;
    sms?: boolean;
    geoTracking?: boolean;
    email?: boolean;
    whatsapp?: boolean;
  };

  weekStartsOn?: string;
  dateFormat?: string;
  timeFormat?: string;
  numberFormat?: string;
  leaveYearStartMonth?: number;

  organizationSetupPlan?: {
    branchesPlanned: number;
    departmentsPlanned: number;
    designationsPlanned: number;
    shiftsPlanned: number;
    needsHolidayCalendar: boolean;
    needsLeavePolicy: boolean;
    needsApprovalMatrix: boolean;
    needsCustomRoles: boolean;
  };

  isActive: boolean;
}

const CompanySchema = new Schema<ICompany>({
  // Basic Info
  legalName: { type: String, required: true },
  tradeName: { type: String },
  industry: { type: String },
  incorporationDate: { type: Date },
  companyType: { type: String },
  website: { type: String },
  logoUrl: { type: String },
  corporateId: { type: String, unique: true, sparse: true },
  documentHeaderImageUrl: { type: String },
  documentFooterText: { type: String, maxlength: 300 },
  founderName: { type: String },

  // Contact & Address
  email: { type: String, required: true },
  phone: { type: String },
  addressLine1: { type: String },
  addressLine2: { type: String },
  city: { type: String },
  state: { type: String },
  postalCode: { type: String },
  country: { type: String },

  // Operational Settings
  timezone: { type: String, default: 'UTC' },
  baseCurrency: { type: String, default: 'INR' },
  financialYearStartMonth: { type: Number, default: 4 },

  // Statutory Compliance (India)
  panNumber: { type: String },
  gstin: { type: String },
  cin: { type: String },
  tan: { type: String },
  epfoNumber: { type: String },
  esicNumber: { type: String },
  ptNumber: { type: String },
  lwfNumber: { type: String },

  // Statutory Compliance (International)
  tin: { type: String },
  ein: { type: String },
  vatNumber: { type: String },
  businessLicenseNumber: { type: String },

  companySize: { type: String },
  description: { type: String, maxlength: 1000 },

  ownerName: { type: String },
  hrName: { type: String },
  alternatePhone: { type: String },
  alternateEmail: { type: String },
  whatsappNumber: { type: String },
  preferredLanguage: { type: String, default: 'English' },
  supportEmail: { type: String },
  supportPhone: { type: String },
  linkedInUrl: { type: String },

  pendingAdminFirstName: { type: String },
  pendingAdminLastName: { type: String },
  pendingAdminEmail: { type: String },
  pendingAdminPhone: { type: String },

  selectedModules: [{ type: String }],
  addonModules: [{ type: String }],

  documents: {
    incorporationCertUrl: { type: String },
    gstCertUrl: { type: String },
    panCardUrl: { type: String },
    otherDocumentUrl: { type: String },
  },

  notificationPreferences: {
    biometric: { type: Boolean, default: false },
    sso: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
    geoTracking: { type: Boolean, default: false },
    email: { type: Boolean, default: true },
    whatsapp: { type: Boolean, default: false },
  },

  weekStartsOn: { type: String },
  dateFormat: { type: String },
  timeFormat: { type: String },
  numberFormat: { type: String },
  leaveYearStartMonth: { type: Number },

  organizationSetupPlan: {
    branchesPlanned: { type: Number, default: 0 },
    departmentsPlanned: { type: Number, default: 0 },
    designationsPlanned: { type: Number, default: 0 },
    shiftsPlanned: { type: Number, default: 0 },
    needsHolidayCalendar: { type: Boolean, default: false },
    needsLeavePolicy: { type: Boolean, default: false },
    needsApprovalMatrix: { type: Boolean, default: false },
    needsCustomRoles: { type: Boolean, default: false },
  },

  isActive: { type: Boolean, default: true },
}, { timestamps: true });

CompanySchema.plugin(tenantPlugin);
CompanySchema.plugin(auditPlugin);

export const Company = mongoose.model<ICompany>('Company', CompanySchema);

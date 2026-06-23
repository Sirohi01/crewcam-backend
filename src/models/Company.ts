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

  isActive: { type: Boolean, default: true },
}, { timestamps: true });

CompanySchema.plugin(tenantPlugin);
CompanySchema.plugin(auditPlugin);

export const Company = mongoose.model<ICompany>('Company', CompanySchema);

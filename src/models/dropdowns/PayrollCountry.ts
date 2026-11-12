import mongoose, { Schema, Model } from 'mongoose';
import { auditPlugin, IAuditable } from '../plugins/auditPlugin';

/**
 * Payroll rules per country, managed by Super Admin (Phase 4 foundation). Statutory
 * contributions and income-tax slabs are data, not code, so rates can be updated each
 * financial year — and new countries added — without a release. India ships seeded
 * (scripts/seedPayrollCountries.ts); the payroll engine (Phase 4) reads the company's
 * country from here.
 */

export type ComponentKind = 'employee_deduction' | 'employer_contribution' | 'employer_liability';
export type ComponentBase = 'basic' | 'gross' | 'basic_da' | 'taxable_income';

export interface IStatutoryComponent {
  code: string;            // e.g. PF, ESI, PT, LWF, GRATUITY
  name: string;
  kind: ComponentKind;
  base: ComponentBase;
  employeeRate?: number;   // % of base
  employerRate?: number;   // % of base
  wageCeiling?: number;    // monthly base is capped at this amount
  eligibilityMaxGross?: number; // applies only when monthly gross <= this (e.g. ESI)
  stateSpecific: boolean;  // rates differ by state (e.g. Professional Tax) and are set per company
  isMandatory: boolean;
  isActive: boolean;
  notes?: string;
}

export interface ITaxSlab {
  upTo: number | null;     // annual taxable income upper bound; null = no upper bound
  rate: number;            // %
}

export interface ITaxRegime {
  code: string;            // e.g. NEW, OLD
  name: string;
  financialYear: string;   // e.g. 2025-26
  isDefault: boolean;
  slabs: ITaxSlab[];
  standardDeduction: number;
  rebateIncomeLimit?: number; // taxable income up to which a rebate applies
  rebateMaxAmount?: number;
  cessRate: number;        // % on tax
}

export interface IPayrollCountry extends IAuditable {
  name: string;
  code: string;            // ISO 3166-1 alpha-2, e.g. IN
  currencyCode: string;    // ISO 4217, e.g. INR
  financialYearStartMonth: number; // 1-12 (India: 4 = April)
  isActive: boolean;
  isDefault: boolean;      // used when a company has no payroll country set
  statutoryComponents: IStatutoryComponent[];
  taxRegimes: ITaxRegime[];
  notes?: string;
}

const componentSchema = new Schema<IStatutoryComponent>({
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  kind: { type: String, enum: ['employee_deduction', 'employer_contribution', 'employer_liability'], required: true },
  base: { type: String, enum: ['basic', 'gross', 'basic_da', 'taxable_income'], required: true },
  employeeRate: { type: Number, min: 0, max: 100 },
  employerRate: { type: Number, min: 0, max: 100 },
  wageCeiling: { type: Number, min: 0 },
  eligibilityMaxGross: { type: Number, min: 0 },
  stateSpecific: { type: Boolean, default: false },
  isMandatory: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  notes: { type: String, trim: true },
});

const regimeSchema = new Schema<ITaxRegime>({
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  financialYear: { type: String, required: true, trim: true },
  isDefault: { type: Boolean, default: false },
  slabs: [{ _id: false, upTo: { type: Number, default: null }, rate: { type: Number, required: true, min: 0, max: 100 } }],
  standardDeduction: { type: Number, default: 0, min: 0 },
  rebateIncomeLimit: { type: Number, min: 0 },
  rebateMaxAmount: { type: Number, min: 0 },
  cessRate: { type: Number, default: 0, min: 0, max: 100 },
});

const schema = new Schema<IPayrollCountry>({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, required: true, trim: true, uppercase: true, unique: true },
  currencyCode: { type: String, required: true, trim: true, uppercase: true },
  financialYearStartMonth: { type: Number, required: true, min: 1, max: 12, default: 1 },
  isActive: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
  statutoryComponents: { type: [componentSchema], default: [] },
  taxRegimes: { type: [regimeSchema], default: [] },
  notes: { type: String, trim: true },
}, { timestamps: true });

schema.plugin(auditPlugin);

export const PayrollCountry = mongoose.models.PayrollCountry as Model<IPayrollCountry> || mongoose.model<IPayrollCountry>('PayrollCountry', schema);

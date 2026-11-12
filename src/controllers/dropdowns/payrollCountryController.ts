import { Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth';
import { PayrollCountry } from '../../models/dropdowns/PayrollCountry';
import { Company } from '../../models/Company';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'Payroll Country Management';
const DIFF_FIELDS = ['name', 'code', 'currencyCode', 'financialYearStartMonth', 'isActive', 'isDefault', 'statutoryComponents', 'taxRegimes', 'notes'];

const blank = (v: unknown) => (v === '' || v === null ? undefined : v);
const optNum = (max?: number) => z.preprocess(blank, (max === undefined ? z.coerce.number().min(0) : z.coerce.number().min(0).max(max)).optional());

const componentSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['employee_deduction', 'employer_contribution', 'employer_liability']),
  base: z.enum(['basic', 'gross', 'basic_da', 'taxable_income']),
  employeeRate: optNum(100),
  employerRate: optNum(100),
  wageCeiling: optNum(),
  eligibilityMaxGross: optNum(),
  stateSpecific: z.boolean().default(false),
  isMandatory: z.boolean().default(true),
  isActive: z.boolean().default(true),
  notes: z.preprocess(blank, z.string().trim().max(500).optional()),
});

const regimeSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(80),
  financialYear: z.string().trim().regex(/^\d{4}-\d{2}$/, 'must look like 2025-26'),
  isDefault: z.boolean().default(false),
  slabs: z.array(z.object({
    upTo: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().positive().nullable()),
    rate: z.coerce.number().min(0).max(100),
  })).min(1, 'needs at least one slab'),
  standardDeduction: z.coerce.number().min(0).default(0),
  rebateIncomeLimit: optNum(),
  rebateMaxAmount: optNum(),
  cessRate: z.coerce.number().min(0).max(100).default(0),
}).superRefine((r, ctx) => {
  // Slabs must climb, and only the last may be open-ended.
  r.slabs.forEach((s, i) => {
    const last = i === r.slabs.length - 1;
    if (s.upTo === null && !last) ctx.addIssue({ code: 'custom', path: ['slabs', i, 'upTo'], message: 'only the last slab can be open-ended' });
    const prev = r.slabs[i - 1];
    if (i > 0 && s.upTo !== null && prev && prev.upTo !== null && s.upTo <= prev.upTo) {
      ctx.addIssue({ code: 'custom', path: ['slabs', i, 'upTo'], message: 'slab limits must increase' });
    }
  });
});

const countrySchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().regex(/^[A-Za-z]{2}$/, 'must be a 2-letter country code').transform((v) => v.toUpperCase()),
  currencyCode: z.string().trim().regex(/^[A-Za-z]{3}$/, 'must be a 3-letter currency code').transform((v) => v.toUpperCase()),
  financialYearStartMonth: z.coerce.number().int().min(1).max(12),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  statutoryComponents: z.array(componentSchema).max(50).default([]),
  taxRegimes: z.array(regimeSchema).max(20).default([]),
  notes: z.preprocess(blank, z.string().trim().max(1000).optional()),
}).superRefine((c, ctx) => {
  const codes = c.statutoryComponents.map((s) => s.code.toUpperCase());
  codes.forEach((code, i) => {
    if (codes.indexOf(code) !== i) ctx.addIssue({ code: 'custom', path: ['statutoryComponents', i, 'code'], message: `duplicate component code ${code}` });
  });
  const regimeKeys = c.taxRegimes.map((r) => `${r.code.toUpperCase()}@${r.financialYear}`);
  regimeKeys.forEach((key, i) => {
    if (regimeKeys.indexOf(key) !== i) ctx.addIssue({ code: 'custom', path: ['taxRegimes', i, 'code'], message: `duplicate regime ${key}` });
  });
  const defaultsPerYear = new Map<string, number>();
  c.taxRegimes.filter((r) => r.isDefault).forEach((r) => defaultsPerYear.set(r.financialYear, (defaultsPerYear.get(r.financialYear) || 0) + 1));
  for (const [fy, n] of defaultsPerYear) {
    if (n > 1) ctx.addIssue({ code: 'custom', path: ['taxRegimes'], message: `only one default regime allowed for ${fy}` });
  }
});

const firstIssue = (e: z.ZodError) => {
  const i = e.issues[0];
  if (!i) return 'Invalid input';
  const path = i.path.join('.');
  return path ? `${path}: ${i.message}` : i.message;
};

/** Only one country can be the platform default. */
const clearOtherDefaults = (id: mongoose.Types.ObjectId) => PayrollCountry.updateMany({ _id: { $ne: id }, isDefault: true }, { $set: { isDefault: false } });

export const getAllPayrollCountries = async (_req: AuthRequest, res: Response) => {
  try {
    const data = await PayrollCountry.find().sort({ isDefault: -1, name: 1 }).populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching payroll countries' });
  }
};

export const createPayrollCountry = async (req: AuthRequest, res: Response) => {
  const parsed = countrySchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });
  try {
    const data = await PayrollCountry.create({ ...parsed.data, createdBy: req.user?._id } as any);
    if (data.isDefault) await clearOtherDefaults(data._id as mongoose.Types.ObjectId);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_PAYROLL_COUNTRY', module: MODULE, details: { name: data.name, changes: diffFields(null, data.toObject(), DIFF_FIELDS) } });
    res.status(201).json({ data });
  } catch (error: any) {
    if (error.code === 11000) return res.status(400).json({ message: 'A payroll country with this name or code already exists' });
    res.status(500).json({ message: 'Error creating payroll country' });
  }
};

export const updatePayrollCountry = async (req: AuthRequest, res: Response) => {
  const parsed = countrySchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });
  try {
    const before = await PayrollCountry.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ message: 'Payroll country not found' });
    const data = await PayrollCountry.findByIdAndUpdate(req.params.id, { ...parsed.data, updatedBy: req.user?._id }, { returnDocument: 'after', runValidators: true });
    if (data?.isDefault) await clearOtherDefaults(data._id as mongoose.Types.ObjectId);
    await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_PAYROLL_COUNTRY', module: MODULE, details: { name: data?.name, changes: diffFields(before, data?.toObject(), DIFF_FIELDS) } });
    res.status(200).json({ data });
  } catch (error: any) {
    if (error.code === 11000) return res.status(400).json({ message: 'A payroll country with this name or code already exists' });
    res.status(500).json({ message: 'Error updating payroll country' });
  }
};

export const deletePayrollCountry = async (req: AuthRequest, res: Response) => {
  try {
    const country = await PayrollCountry.findById(req.params.id).lean();
    if (!country) return res.status(404).json({ message: 'Payroll country not found' });
    const inUse = await Company.countDocuments({ payrollCountry: country.code } as any).setOptions({ bypassTenantIsolation: true });
    if (inUse > 0) {
      return res.status(409).json({ message: `${inUse} compan${inUse === 1 ? 'y uses' : 'ies use'} this payroll country. Deactivate it instead.` });
    }
    await PayrollCountry.deleteOne({ _id: country._id });
    await writeAuditLog({ userId: req.user?._id, action: 'DELETE_PAYROLL_COUNTRY', module: MODULE, details: { name: country.name, changes: diffFields(country, null, DIFF_FIELDS) } });
    res.status(200).json({ message: 'Payroll country deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting payroll country' });
  }
};

/**
 * GET /api/v1/payroll-config — the signed-in company's payroll country rules (the
 * company's `payrollCountry`, else the platform default). Read-only, non-sensitive.
 */
export const getMyPayrollCountry = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const company = await Company.findOne({ tenantId } as any).select('payrollCountry').lean();
    const code = (company as any)?.payrollCountry;
    const country = (code && await PayrollCountry.findOne({ code, isActive: true }).lean())
      || await PayrollCountry.findOne({ isDefault: true, isActive: true }).lean();
    res.status(200).json({ data: country || null });
  } catch (error) {
    res.status(500).json({ message: 'Error loading payroll configuration' });
  }
};

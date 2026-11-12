import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { PayrollCountry } from '../src/models/dropdowns/PayrollCountry';

dotenv.config();

/** Seeds India as the default payroll country (FY 2025-26 rules). More countries are
 * added from Super Admin → Dropdowns → Payroll Countries.
 *
 * The figures below reflect the published FY 2025-26 rules as understood at the time of
 * writing. They MUST be reviewed by your CA / payroll adviser before any payroll run, and
 * updated each financial year in Super Admin — they are data, not code.
 *
 * Idempotent: inserts only if India doesn't exist ($setOnInsert), so edits made in Super
 * Admin are never overwritten.
 * Usage: npx ts-node scripts/seedPayrollCountries.ts
 */
const INDIA = {
  name: 'India',
  code: 'IN',
  currencyCode: 'INR',
  financialYearStartMonth: 4,
  isActive: true,
  isDefault: true,
  notes: 'Seeded with FY 2025-26 rules. Verify with your CA before running payroll; update every financial year.',
  statutoryComponents: [
    {
      code: 'PF', name: 'Provident Fund (EPF)', kind: 'employee_deduction', base: 'basic_da',
      employeeRate: 12, employerRate: 12, wageCeiling: 15000, stateSpecific: false, isMandatory: true, isActive: true,
      notes: 'Employer 12% = 8.33% EPS (on wages up to ₹15,000) + 3.67% EPF. Mandatory for establishments with 20+ employees.',
    },
    {
      code: 'ESI', name: "Employees' State Insurance", kind: 'employee_deduction', base: 'gross',
      employeeRate: 0.75, employerRate: 3.25, eligibilityMaxGross: 21000, stateSpecific: false, isMandatory: true, isActive: true,
      notes: 'Applies when monthly gross wages are ₹21,000 or less (₹25,000 for persons with disability).',
    },
    {
      code: 'PT', name: 'Professional Tax', kind: 'employee_deduction', base: 'gross',
      stateSpecific: true, isMandatory: true, isActive: true,
      notes: 'Slabs vary by state (maximum ₹2,500 per year). Configure per company/state.',
    },
    {
      code: 'LWF', name: 'Labour Welfare Fund', kind: 'employee_deduction', base: 'gross',
      stateSpecific: true, isMandatory: false, isActive: true,
      notes: 'State-specific employee and employer contributions; not applicable in every state.',
    },
    {
      code: 'GRATUITY', name: 'Gratuity', kind: 'employer_liability', base: 'basic_da',
      employerRate: 4.81, stateSpecific: false, isMandatory: true, isActive: true,
      notes: '15 days of last-drawn wages per completed year of service (15/26 ≈ 4.81% provision). Payable after 5 years; ceiling ₹20 lakh.',
    },
    {
      code: 'TDS', name: 'Income Tax (TDS)', kind: 'employee_deduction', base: 'taxable_income',
      stateSpecific: false, isMandatory: true, isActive: true,
      notes: 'Computed monthly from the employee\'s chosen tax regime below.',
    },
  ],
  taxRegimes: [
    {
      code: 'NEW', name: 'New Tax Regime (Section 115BAC)', financialYear: '2025-26', isDefault: true,
      slabs: [
        { upTo: 400000, rate: 0 }, { upTo: 800000, rate: 5 }, { upTo: 1200000, rate: 10 },
        { upTo: 1600000, rate: 15 }, { upTo: 2000000, rate: 20 }, { upTo: 2400000, rate: 25 }, { upTo: null, rate: 30 },
      ],
      standardDeduction: 75000, rebateIncomeLimit: 1200000, rebateMaxAmount: 60000, cessRate: 4,
    },
    {
      code: 'OLD', name: 'Old Tax Regime', financialYear: '2025-26', isDefault: false,
      slabs: [{ upTo: 250000, rate: 0 }, { upTo: 500000, rate: 5 }, { upTo: 1000000, rate: 20 }, { upTo: null, rate: 30 }],
      standardDeduction: 50000, rebateIncomeLimit: 500000, rebateMaxAmount: 12500, cessRate: 4,
    },
  ],
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const result = await PayrollCountry.updateOne({ code: INDIA.code }, { $setOnInsert: INDIA }, { upsert: true });
  if (result.upsertedCount) {
    // Exactly one platform default.
    await PayrollCountry.updateMany({ code: { $ne: INDIA.code }, isDefault: true }, { $set: { isDefault: false } });
    console.log('India payroll country created (default)');
  } else {
    console.log('India payroll country already exists (unchanged)');
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});

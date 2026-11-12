# Phase 4 foundation — payroll countries (product decision: "India payroll now, other countries manageable from admin")

| | |
|---|---|
| **Branch** | `agent_changes` (crewcam-backend, hrcrm-superadmin) |
| **Status** | ✅ Done: configuration layer. The payroll *calculation engine* that uses it is Phase 4 proper. |

## What this delivers

Payroll rules are **data, managed in Super Admin**, not code:

- **Statutory components:** PF, ESI, Professional Tax, gratuity…
- **Income-tax regimes:** slabs, standard deduction, rebate, cess.

India ships seeded as the platform default. Other countries are added in **Super Admin → Dropdowns → Payroll Countries**. Each company uses its own payroll country, or the default.

## Model — `PayrollCountry` (platform-level, `models/dropdowns/PayrollCountry.ts`)

| Field | Purpose |
|---|---|
| `name`, `code` (ISO-2), `currencyCode` (ISO-4217), `financialYearStartMonth` | Basics (India: IN, INR, April) |
| `isActive`, `isDefault` | Exactly one default; marking one default clears the others |
| `statutoryComponents[]` | See below |
| `taxRegimes[]` | See below |

Each statutory component has:

- `code`, `name`;
- `kind`: employee deduction, employer contribution or employer liability;
- `base`: basic, basic+DA, gross or taxable income;
- `employeeRate`, `employerRate` (%), `wageCeiling`, `eligibilityMaxGross`;
- flags: `stateSpecific`, `isMandatory`, `isActive`; plus `notes`.

Each tax regime has `code`, `financialYear` (e.g. 2025-26), `isDefault`, `slabs[{upTo, rate}]`, `standardDeduction`, `rebateIncomeLimit`, `rebateMaxAmount` and `cessRate`.

## Validation (Zod, `controllers/dropdowns/payrollCountryController.ts`)

- 2-letter country code and 3-letter currency code (upper-cased); rates 0–100%; amounts ≥ 0.
- Component codes unique within a country.
- Regime code unique per financial year, and at most one default regime per year.
- Slabs must increase; only the **last** slab may be open-ended (blank "up to").
- **Delete is refused (409) while any company uses the country.** Deactivate it instead.
- Every create, update and delete is audit-logged with a field diff, and shown in the page's activity log.

## API

| Route | Who |
|---|---|
| `GET/POST /super-admin/payroll-countries`, `PUT/DELETE /super-admin/payroll-countries/:id` | Super admin only |
| `GET /payroll-config` | Any signed-in user. Returns their company's country, or the active default. Read-only, non-sensitive. |

**Company setting:** `Company.payrollCountry` (ISO code; blank = platform default).

- Accepted by the super admin create/update tenant endpoints and the company wizard draft.
- Set in **Company wizard → System Configuration → Payroll Country**.

## India seed — `scripts/seedPayrollCountries.ts`

FY 2025-26 rules. **Have them reviewed by your CA before the first payroll run, and update them every financial year.**

| Component | Seeded as |
|---|---|
| PF | 12% employee + 12% employer on Basic + DA; ₹15,000 wage ceiling (employer split 8.33% EPS / 3.67% EPF in notes) |
| ESI | 0.75% employee + 3.25% employer on gross; only when gross ≤ ₹21,000 |
| Professional Tax | State-specific (rates per company/state; max ₹2,500/yr) |
| LWF | State-specific, optional |
| Gratuity | 4.81% employer liability on Basic + DA (15/26 of monthly wages per year; payable after 5 years; ₹20 lakh ceiling) |
| TDS | Computed from the tax regime |

**New regime 2025-26 (default):**

- **Slabs:** 0 up to ₹4L · 5% up to ₹8L · 10% up to ₹12L · 15% up to ₹16L · 20% up to ₹20L · 25% up to ₹24L · 30% above.
- **Deductions and rebate:** standard deduction ₹75,000; rebate up to ₹60,000 for taxable income up to ₹12L.
- **Cess:** 4%.

**Old regime 2025-26:**

- **Slabs:** 0 up to ₹2.5L · 5% up to ₹5L · 20% up to ₹10L · 30% above.
- **Deductions and rebate:** standard deduction ₹50,000; rebate up to ₹12,500 up to ₹5L.
- **Cess:** 4%.

The seed is idempotent (`$setOnInsert`), so edits made in Super Admin are never overwritten.

## Tests — `src/tests/superAdmin/payrollCountries.test.ts` (5/5 pass)

- Create and edit; codes normalised; blank slab bound means open-ended; one platform default.
- Invalid rules rejected: 3-letter code, rate > 100%, duplicate component, decreasing slabs, open-ended slab not last, two default regimes.
- Non-super-admin → 403.
- Delete while a company uses the country → 409.
- A company reads its own country, or the default.

## Known gap found (not fixed here)

On the company wizard's **System Configuration** step, the existing nine regional selects are **uncontrolled and never saved**:

- financial year, week start, date format, time format, first day of month;
- time zone, currency, number format, leave year.

Only the module toggles, and the new Payroll Country select, are bound to the wizard state. This is planned for Phase 5 (super admin completion).

## Deploy

1. Deploy the backend, then super admin.
2. Run `npx ts-node scripts/seedPayrollCountries.ts` once per environment.
3. Have the India figures reviewed, and edit them in Super Admin if needed.

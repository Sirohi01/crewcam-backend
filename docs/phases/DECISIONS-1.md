# Decisions batch 1 — implementing the product owner's answers (2026-11-09)

| | |
|---|---|
| **Branch** | `agent_changes` (crewcam-backend, crewcam-frontend, hrcrm-superadmin) |
| **Status** | Items 1–3 done in this commit. Items 4–5 are separate slices (see the tracker) |

| # | Decision | Implementation |
|---|---|---|
| 1 | WhatsApp sending and Department KPI edits: **Company Admin and Admin**, other roles addable later | Two catalogue permissions, gated routes, Admin preset + migration script (§1) |
| 2 | Bharat Organic careers belong to **Namogange Wellness**, resolved dynamically | Tenant resolved from configuration; all three endpoints scoped (§2) |
| 3 | Payment Obligations price **optional and editable later** | Optional price on catalogue modules; wizard shows catalogue add-ons (§3) |
| 4 | **HR approval** for changes to HR-owned profile fields | Slice 1E (separate commit) |
| 5 | **India payroll now, other countries configurable from admin** | Phase 4 foundation slice (separate commit) |

---

## 1. Permissions for WhatsApp sending and Department KPIs

**New catalogue permissions** (`permissionAdminController.ts`, so they appear in **Settings → Role Rights**):

- `NOTIFICATION_SEND`: required by `POST /notifications/whatsapp/send`. OTP send/verify are unchanged.
- `KPI_WRITE`: required by `POST` and `PUT /department-kpis`. Reads are unchanged.

**Who has them:**

- **Company Admin** has `*`, so it is covered automatically.
- **Admin:** the role preset (`crewcam-frontend/src/lib/rolePresets.ts`) includes both, and both appear as Role Rights chips ("WhatsApp Messages", "Department KPIs").
- **Existing Admin roles** created from the old preset get them through `scripts/grantAdminMessagingKpiPermissions.ts` (idempotent `$addToSet`; dry run by default, `--apply` to write).
- **Any other role:** grant in Role Rights; no code change needed.

**Behaviour change:** users without these permissions now get 403 on those two writes. That is intended.

## 2. Bharat Organic careers (public API)

**What was wrong:** `GET /careers/bharat-organic/jobs`, `GET …/jobs/:id` and `POST …/apply` queried jobs with no tenant at all.

- Under the tenant plugin, every call **returned 500 in production**.
- Without the plugin, the design would have listed *every* company's posted jobs.
- Apply would have filed candidates under the job's company or a **random generated tenant id**.

**Fix — the tenant is resolved, not hard-coded:**

1. `BHARAT_ORGANIC_TENANT_ID` (env), if set, as an explicit override.
2. Otherwise, the company whose **Website** is `bharatorganicexpo.com` (set in Super Admin). This is the convention the existing Bharat Organic scripts already use, and today it is Namogange Wellness.

The lookup is cached for 5 minutes, but only when it finds a company. A newly configured site works immediately. With nothing configured, the API returns **503** "not configured".

**Also fixed:**

- List and detail show only that company's jobs; bad or foreign job ids return **404**.
- Apply:
  - requires a valid email and phone (a missing phone used to crash with 500, because `Candidate.phone` is required);
  - requires `resumeUrl` to be http(s);
  - rejects a job that isn't the company's;
  - is rate-limited (`apiLimiter`).
- Internal error messages are hidden from public responses in production.

**Tests:** `src/tests/security-fixes/bharatOrganicCareers.test.ts`, 2/2 pass. They cover:

- 503 when not configured
- only the configured company's jobs listed; another company's job not leaked
- foreign / invalid job id → 404
- apply: foreign job 404, bad email 400, missing phone 400
- a valid application is filed under the configured company

**Deploy:** make sure Namogange Wellness's company Website is `https://bharatorganicexpo.com`, or set `BHARAT_ORGANIC_TENANT_ID`.

## 3. Optional, editable add-on prices (Payment Obligations)

**Backend** (`models/dropdowns/Module.ts`):

- Catalogue modules gain an optional `price` (≥ 0) and a `pricingUnit` (`Per Employee / Month` or `Per Company / Month`).
- No price means "price on request".
- Module updates now run validators, and price changes are recorded in the module audit diff.

**Super Admin → Modules Management:**

- New **Add-on Price (₹)** field (leave blank to set later) and **Pricing Unit** select.
- Optional modules show their price, or "Price on request", on their card.

**Company wizard (step 2):**

- The five built-in add-ons are unchanged.
- Every **active, optional, package-visible** catalogue module is appended (de-duplicated by code), so Payment Obligations appears once registered (`scripts/seedPaymentObligationsModule.ts`).
- The estimate honours the pricing unit: per employee × headcount, or per company once. An unpriced module counts as ₹0 and shows "Price on request".
- The review step shows catalogue add-ons by name.
- Selecting a module stores its **code** in the company's add-ons, which is what the feature gate checks (see PHASE-7A).

**To set the price later:** Modules Management → Payment Obligations → Add-on Price.

## Verification

| Check | Result |
|---|---|
| Backend `tsc --noEmit` | Pass |
| `bharatOrganicCareers.test.ts` | 2/2 pass |
| Super admin `tsc --noEmit` | Pass |
| Super admin ESLint (changed pages) | 0 errors; 5 warnings, the same as before the change |
| Frontend `tsc` | Pass (role preset change) |

**Not done:** manual check in the super admin UI.

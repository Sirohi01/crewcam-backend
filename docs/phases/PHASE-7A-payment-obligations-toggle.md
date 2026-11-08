# Phase 7A — Payment Obligations as a switchable add-on

| | |
|---|---|
| **Branch** | `agent_changes` (crewcam-backend) |
| **Date** | 2026-11-08 |
| **Status** | Done. Tests pass; not yet deployed |
| **Scope** | The on/off switch and gating only. The module's screens and data (bills, rent, renewals, insurance, vehicle compliance, tax dues, reminders) are **Phase 7**. |

## 1. Goal

Payment Obligations is not a standard HRMS feature (Zoho People and HROne don't offer it), so it is sold as an **optional add-on**. Super admin must be able to switch it on or off, and when it's off it must be completely absent: no menu, no API.

## 2. How to switch it

| Level | Where | Effect |
|---|---|---|
| **Platform-wide** | Super Admin → Settings → **Modules Management** → *Payment Obligations* → Active / Inactive | Inactive turns it off for **every** company, whatever they bought |
| **Per package** | Super Admin → Subscriptions → plan builder → tick *Payment Obligations* | Every company on that plan gets it |
| **Per company** | `Company.addonModules` contains `payment-obligations` | That company gets it regardless of plan. **The wizard checkbox is pending a price (§6).** |

A user also needs the `OBLIGATIONS_READ` permission (grant in **Settings → Role Rights**). Company Admin (`*`) has it automatically.

**One-time setup:** register the module in the catalogue:

```bash
npx ts-node scripts/seedPaymentObligationsModule.ts
```

It is idempotent: it inserts only when missing, so edits made later in super admin are never overwritten.

## 3. What was wrong with feature gating (and is now fixed for all add-ons)

Building the switch exposed that add-on gating didn't really work, for any add-on:

1. **Package entries were never translated.** The v2 plan builder (commit `a2e1f7b`) stores **module database IDs** in `Package.features` and `Package.addOnModules`. Both feature checks compared against **names** (`requireFeature('Core HR')`, sidebar `requiredFeature: 'integrations'`), so nothing from a v2 package ever matched. Gated items were blocked even when paid for.
2. **The API and the sidebar read different sources.** `requireFeature` honoured package add-ons, company add-ons and tenant modules; the sidebar's `getTenantFeatures` read only `Package.features`. An add-on could unlock the API while its menu stayed hidden.
3. **New add-on sections were hidden by `allowedSections`.** Tenants restricted to a section list never saw a new section, even after buying it.

**Fix:**

- **One resolver for both checks.** New `src/utils/featureKeys.ts` has `expandFeatureEntries()`, which turns IDs into the module's `name` and `code` (only modules marked **active**) and passes names and slugs through. `middleware/featureGate.ts` and `utils/visibilityFilter.ts` both use it, so they can't disagree.
- **The sidebar now honours** package add-ons, company add-ons and enabled tenant modules.
- **Section ownership:** `FEATURE_SECTIONS` maps an add-on to the sidebar section it owns, and that section is added to `allowedSections` when the add-on is on.

**Expected side effect:** tenants on v2 packages will now **see** features they paid for that were wrongly hidden (e.g. Integrations, AI Resume Screening). Access only widens to match the package; nothing is taken away.

## 4. Changes

| File | Change |
|---|---|
| `src/utils/featureKeys.ts` | **New.** `normalizeFeatureKey`, `expandFeatureEntries`, `PAYMENT_OBLIGATIONS_FEATURE = 'payment-obligations'`, `FEATURE_SECTIONS` |
| `src/middleware/featureGate.ts` | Uses the shared resolver for package features, package add-ons and company add-ons |
| `src/utils/visibilityFilter.ts` | Same resolver; adds add-ons and enabled tenant modules; add-on sections survive `allowedSections` |
| `src/utils/sidebarDefaults.ts` | New **Payment Obligations** section: Monthly Obligations, Yearly Obligations, Tax Obligations, Payment Reminders. Each needs `OBLIGATIONS_READ` and the add-on, and links to "coming soon" until Phase 7. Existing tenants receive it automatically through `syncSidebarDefaults`. |
| `src/controllers/permissionAdminController.ts` | `OBLIGATIONS_READ` / `OBLIGATIONS_WRITE` added to the permission catalogue |
| `src/routes/paymentObligationRoutes.ts` + `app.ts` | **New** router at `/api/v1/payment-obligations`, entirely behind `authenticate` → `tenantResolver` → `requireFeature('payment-obligations')`. Only `GET /status` for now; Phase 7 adds CRUD here, so turning the add-on off closes the whole API. |
| `scripts/seedPaymentObligationsModule.ts` | **New.** Registers the module (category Finance, optional, not default) |

## 5. Verification

| Check | Result |
|---|---|
| `tsc --noEmit`, plus the script typechecked on its own | Pass |
| New suite `src/tests/featureToggles/paymentObligations.test.ts` | **7/7 pass** |
| Same suite against the original gate and sidebar code | Tests 2, 3, 5 and 6 **fail**, confirming the three defects in §3 |
| Full backend suite (clean build, SMTP blanked) | 242/250; the same **8 pre-existing** failures as Phase 0. No regressions |

The test cases:

- off by default (API 403, no menu)
- on via package
- on via company
- module deactivated → off everywhere
- section visible despite `allowedSections`
- v2 core-feature IDs gate correctly

**Not done:** manual check in the super admin UI.

## 6. Decisions needed

- **Price:** the company wizard (super admin step 2) uses a **hard-coded** add-on list whose price strings are multiplied into the billing estimate. Payment Obligations is left out until a price is set. Better long-term fix (proposed for Phase 5): load that list from the module catalogue, so prices live in one place.
- **Section access:** the section is not in `ADMIN_EXCLUSIVE_SECTIONS`, so an employee-login role with `OBLIGATIONS_READ` can see it. Restrict it to employer logins?

## 7. Deployment and rollback

1. Deploy the backend.
2. Run `scripts/seedPaymentObligationsModule.ts` once per environment.
3. Tick the module on the relevant plans, or leave it off.

**Rollback:** redeploy the previous build. The module row and the sidebar rows are harmless to old code; set the module Inactive to hide it.

## 8. Is this a good approach?

Yes, with the caveats above:

- **Feature flags at three levels** (platform, plan, company) are the standard SaaS pattern, and sales can trial it per company.
- **Gating the API, not just the menu**, is what makes "off" really off.
- **Using the existing module catalogue** avoids creating a fourth add-on list.
- **Remaining weakness:** the hard-coded wizard list, a separate `AddOnModule` collection and the `FeatureFlag` collection overlap with the module catalogue. Consolidating them into one catalogue is the right cleanup (proposed for Phase 5).

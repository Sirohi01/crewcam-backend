# Phase 0 — Security & tenant-isolation hardening

| | |
|---|---|
| **Branch** | `agent_changes` (crewcam-backend, crewcam-frontend) |
| **Base commit** | backend `a2e1f7b`, frontend `300f237` |
| **Date** | 2026-11-08 |
| **Status** | Done. Tests pass; not yet deployed |
| **Related** | Frontend part: `crewcam-frontend/docs/phases/PHASE-0-hardening.md` |

## 1. Why this phase existed

CrewCam is multi-tenant: every company's data lives in the same MongoDB database and is separated only by `tenantId`. Before any new feature work, we audited whether that separation actually holds. It did not in several places. This phase closes those gaps and adds tests so they cannot silently reopen.

## 2. Urgent action outside the code

**Rotate both MongoDB Atlas database users.** Full connection strings, including passwords, for two Atlas clusters were committed to:

- `scratch_check.js`
- `scratch/fix-tenants.ts`
- `scripts/backfillBharatOrganicJobs.ts` (the "organic" cluster)

They have been pushed to `github.com/Sirohi01/crewcam-backend`. This phase replaces them with environment variables (`MONGODB_URI`, `ORGANIC_MONGODB_URI`), but **git history still contains them**. Only rotating the passwords in the Atlas console makes them useless. Then update the `.env` on every server.

## 3. Findings and fixes

Severity: **Critical** = data of one company readable or writable by another. **High** = abuse or denial-of-service without special access. **Medium** = defence in depth or a latent risk.

### 3.1 Critical: team members leaked between companies

- **Problem:** team members were looked up only by sub-department *name* (e.g. `interior-design`). Any two companies with a sub-department of the same name could list, edit and delete each other's members. New members were created without a `tenantId`. The "employee ID / email already exists" check ran across all companies, so Company B was blocked from using IDs that Company A already had, and the error revealed that A's record existed.
- **Fix** (`controllers/teamMemberController.ts`): every query (list, count, get, create, update, delete, duplicate checks) is now constrained to the caller's `tenantId`, and new members are stamped with it. `TeamMember` now uses the tenant plugin, so a query without `tenantId` throws instead of leaking.
- **Data migration:** existing members without a `tenantId` must be backfilled (see §6).

### 3.2 Critical: business units by ID ignored the company

- **Problem:** `getBusinessUnitById`, `updateBusinessUnit` and `deleteBusinessUnit` used `findById(id)` with no tenant check. The update also passed `{ $set: req.body }`, so a body containing `tenantId` could move the record into another company.
- **Fix** (`controllers/businessUnitController.ts`): lookups use `{ _id, tenantId }`, and `tenantId` / `_id` are stripped from update bodies. The model now uses the tenant plugin.

### 3.3 Critical: budget allocations crossed companies

- **Problem:** `BudgetAllocation` has no `tenantId` field. It belongs to a company only through its department, and nothing checked that. A logged-in user could:
  - read another company's budget by passing its department ID;
  - **overwrite** it, because create is an upsert;
  - get, update, approve or delete any budget by ID, through the duplicate stack in §3.4.
- **Fix** (`controllers/budgetAllocationController.ts`): every handler first loads the caller's department IDs and constrains its query to them. A foreign department or budget ID now returns 404. This also covers existing records, so no migration is needed.
- **Note:** `GET /companies/departments/budget-allocations` (list all) was never reachable: `GET /departments/:id` is registered first and captures it. It is left unreachable because the frontend doesn't use it.

### 3.4 Critical (root cause): `server.ts` registered the whole app twice

- **Problem:** `server.ts` imported the fully configured app from `app.ts`, then re-registered the JSON parser, helmet, CORS (with a different allow-list), every router, and one extra unauthenticated router (`routes/budgetAllocationRoutes.ts`). `app.ts` has no 404 catch-all, so any request it didn't match fell through into this second copy.
- **Fix:** `server.ts` now only loads config, connects to MongoDB, starts the cron jobs and listens. All middleware and routes live in `app.ts`, which the tests exercise. The dead `budgetAllocationRoutes.ts` is deleted, after confirming no client calls its routes.

### 3.5 High: unescaped user input in database regex searches

- **Problem:** search text went straight into `$regex` / `new RegExp(...)` in 11 files, including the **public, unauthenticated** careers API. A pattern like `(a+)+$` causes catastrophic backtracking (ReDoS), and input like `(` is an invalid pattern that returns a 500 error.
- **Fix:** a new `utils/regex.ts` with `escapeRegex()` and `toSearchPattern()` (escapes, takes the first value if an array arrives, trims, caps at 100 characters). Applied in:
  - routes: `careerPortalRoutes`
  - controllers: `hiringController`, `hiringRequisitionController`, `aiHiringController`, `organizationController`, `subDepartmentController`, `masterDataController`, `leadController`, `platformController`, `teamMemberController`
  - utils: `candidateIdGenerator`

  `teamMemberController`'s private copy of the helper was replaced with the shared one.

### 3.6 High: mock publishing endpoints were public

- **Problem:** `/api/v1/test-publish/*` (mock Naukri/LinkedIn) had no authentication. Anyone could write `TestJobPosting` records or list them. They can't simply be switched off, because `publishService.ts` routes to them whenever real credentials are missing, including in production.
- **Fix:** a new `middleware/testPublishGuard.ts`. The caller must send `x-test-publish-key`, an HMAC of the JWT secret: identical on every instance, unknown outside the server. `publishService.ts` attaches it **only** when calling the mock, never to the real APIs.

### 3.7 Medium: authentication depended on registration order

- **Problem:** `/api/v1/sub-departments` (team members) and `/api/v1/notifications` (WhatsApp OTP and send) had no `authenticate` of their own. They were protected only because `jdKpaRoutes`, mounted earlier on bare `/api/v1`, runs `router.use(authenticate)` for everything after it. Reordering `app.ts` would have made them public.
- **Fix:** both routers declare `authenticate` + `tenantResolver` explicitly. `authenticate` now returns immediately when `req.user` is already set, so the second declaration costs no extra database lookup. `notificationController` no longer accepts `tenantId` from the request body.

### 3.8 Medium: tenant plugin gaps

`models/plugins/tenantPlugin.ts`:

- **`aggregate()` is now guarded.** The pipeline must start with a `$match` on `tenantId`; opt out with `.option({ bypassTenantIsolation: true })`. Every existing aggregate on a protected model already complied; this was checked before enabling the guard.
- **Updates can no longer change `tenantId`.** It is removed from `findOneAndUpdate`, `updateOne` and `updateMany` updates (top level, `$set`, `$unset`, `$rename`). This protects controllers that forward `req.body`, e.g. `divisionController`, `companyPolicyController`. Upserts still get the correct `tenantId`, because MongoDB copies it from the (required) filter.
- **Seven models that had a `tenantId` but no enforcement now use the plugin:** `Division`, `BusinessUnit`, `CompanyPolicy`, `DepartmentPolicy`, `DepartmentDocument`, `DepartmentCustomField`, `TeamMember`. All their queries were checked to include `tenantId` first.

### 3.9 Medium: `x-tenant-id` header trusted

- **Problem:** `tenantResolver` took the tenant from the client's `x-tenant-id` header when the user record had none. This turned out to be unreachable: every router runs `authenticate` first, and every user has a `tenantId` (super admins use the literal `SUPER_ADMIN`). It would have become exploitable on the first route that mounted `tenantResolver` without `authenticate`.
- **Fix:** the header is ignored. An authenticated user without a `tenantId` gets 403. Unauthenticated requests can still resolve a tenant from the Host subdomain.

### 3.10 Medium: missing permission checks on org-setup writes

- **Problem:** any logged-in employee could create, edit or delete business units, divisions, cost centres, department documents/policies/custom fields, and custom fields.
- **Fix:** writes now require `ORG_WRITE`, matching designations, job families and job grades. Reads are unchanged.
  - `ORG_WRITE` is in the standard employer presets (`rolePresets.ts`) and the seeders.
  - Employee-login roles (HR Admin, HOD, …) start with no permissions. If such a role should manage org setup, grant `ORG_WRITE` in **Settings → Role Rights**.
- **Deliberately not changed:** Department KPIs, pending a product decision (see §7).

### 3.11 Bug found by the new tests: loading a saved budget always failed

- **Problem:** `getBudgetAllocationByDepartment` populates `approvedBy`, which wasn't in the schema, so every successful lookup returned 500. `budgetOwnerId`, `preparedById` and `createdBy` referenced a model named `Employee` that doesn't exist; users are `User`. The approve handler's `approvedBy` / `approvedOn` were silently dropped by strict mode.
- **Fix** (`models/BudgetAllocation.ts`): refs now point to `User`, and `approvedBy` / `approvedOn` were added. The frontend already sends `User` IDs (from `/employees`) and handles populated objects.

### 3.12 Repo hygiene

- **Logs:** five `*.log` files are no longer tracked, and `*.log` is in `.gitignore`. They were scanned first: no credentials, tokens, emails or phone numbers.

## 4. Changes in this phase that alter behaviour

| Change | Who notices |
|---|---|
| Org-setup writes need `ORG_WRITE` | Employee-login users without that permission get 403 (intended) |
| Team members without `tenantId` disappear until backfilled | Everyone, if the backfill (§6) is skipped |
| A request body can no longer change `tenantId` | No legitimate flow did this |
| Duplicate employee-ID/email check is per company | Companies can reuse IDs that another company already uses |
| `x-tenant-id` ignored | Nobody: the frontend sends it but it was never used |

## 5. Verification

| Check | Result |
|---|---|
| `tsc --noEmit` (backend) | Pass, 0 errors |
| New suite `src/tests/security-fixes/tenantIsolation.test.ts` | **11/11 pass** |
| Same suite against the original team-member / business-unit controllers | Those tests **fail**, so they detect the leaks |
| Full backend suite, clean build, real `.env` with SMTP vars blanked | 235/243 pass |
| Same full suite on the untouched base commit, same env | 224/232 pass |
| Failing set, before vs after | **Identical 8.** No regressions |

The 8 failures that predate this phase (not caused by it):

- `moderateImage` fail-closed and fail-open (×2)
- `requireStepUnlocked` STEP_LOCKED
- 24-step hiring happy path
- CORS untrusted origin
- super-admin tenant delete (×2, plus the suite)

They are tracked for a later phase. With SMTP configured, four more "no SMTP configured" tests fail because they reach the real mail server; that's an environment issue, not a code one.

**Not done:** manual click-through testing of the running apps.

How to run the tests:

```bash
cd crewcam-backend
npm run build
node --test dist/tests/security-fixes/tenantIsolation.test.js
```

## 6. Deployment

1. **Back up:** `mongodump --uri "$MONGODB_URI" --out backup-$(date +%F)`
2. **Preview the backfill (dry run):**
   ```bash
   npx ts-node scripts/backfillTeamMemberTenant.ts
   ```
   It matches each orphaned member to a company: first by `departmentId`, otherwise by a sub-department name that exactly one company owns. Ambiguous records are listed, never guessed.
3. **Apply it:** add `--apply`, run it just **before** deploying, and fix any listed records by hand.
4. **Deploy the backend**, then the frontend.
5. **Run with `--apply` again** to catch members created during the deploy.
6. **Smoke test:**
   - team-member list on a sub-department page
   - business units
   - load and save a department budget

**Rollback:** redeploy the previous build. Nothing is deleted from the database, and the backfill only *adds* `tenantId` (the old code ignores it).

## 7. Open items (owner: product)

- **Payload size:** the global 50 MB JSON limit stays, because webcam check-in, SOS and mobile attachments send base64 in JSON. Move them to multipart `/upload` (Phase 1), then lower the limit.
- **WhatsApp send:** `POST /notifications/whatsapp/send` is open to any logged-in employee. Which permission should it require?
- **Department KPIs:** writes have no permission check. Should HODs edit their own department's KPIs?
- **Bharat Organic jobs page:** `GET /careers/bharat-organic/jobs` already returns 500 in production; its query has no tenant, and the plugin rejects it. Which company's jobs should it show?
- **Budget schema:** `BudgetAllocation` lacks `subDepartmentId` and `utilizedAmount`, which the controller writes. Its unique index allows one budget per department per year. Revisit in Phase 2.
- **Duplicated helper:** `requireTenantId` is copied in four controllers. Consolidate it when those files are next touched.

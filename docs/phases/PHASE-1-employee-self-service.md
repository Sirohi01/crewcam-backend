# Phase 1 — Employee self-service (backend)

| | |
|---|---|
| **Branch** | `agent_changes` |
| **Status** | 🚧 In progress. Delivered in slices; each slice is its own commit and section below |
| **Frontend** | `crewcam-frontend/docs/phases/PHASE-1-employee-self-service.md` |
| **Goal** | The employee-login screens (designs in `hr_images_devGroup/employee login/`) show and edit the signed-in employee's real data instead of hard-coded samples |

## Slices

| Slice | Scope | Status |
|---|---|---|
| **1A** | `/api/v1/me` API: profile, family, emergency, education, certifications, courses, experience, skills, bank (read-only); **2FA-secret leak fix** | ✅ Done |
| 1B | Frontend: wire Family, Emergency, Education, Bank Details to `/me` (see frontend doc) | ✅ Done |
| 1C | Personal Info (`my-profile`), Experience, Skills tabs; leave, attendance, payslip, reimbursement; move webcam/attachment uploads off base64 JSON | Next |
| 1D | My Requests, My Tasks, Policies, Helpdesk, Notifications, Assets, Training | Planned |
| 1E | HR approval flow for HR-owned profile fields (name, DOB, PAN, bank…) + encryption-key hardening | ✅ Done |

---

## Slice 1A — `/me` API and 2FA-secret leak

### 1. Security fix: every employee endpoint leaked the 2FA secret (Critical)

**Problem:** `User.twoFactorSecret`, the TOTP seed, was returned by `GET /employees`, `GET /employees/:id`, `PUT /employees/:id` and `GET /employees/current`, because they only excluded `passwordHash`. Anyone with `EMPLOYEE_READ` could read every colleague's seed and generate their 2FA codes, which defeats 2FA. It also reached the browser for the current user, where any XSS could steal it.

**Fix:**

- `models/User.ts`: `twoFactorSecret` is `select: false`, so it is never loaded unless code asks for it.
- `controllers/authController.ts`: the three handlers that verify codes (`login2FA`, `verifyAndEnable2FA`, `disable2FA`) opt in with `.select('+twoFactorSecret')`.
- `setup2FA` only writes the secret, so it needs no change. Saving a document loaded without the field leaves the stored value intact.

**Verified:**

- A test fetches all four endpoints plus `/me/profile` and asserts the secret is absent. Against the original model it fails with `/api/v1/employees/current leaked twoFactorSecret`.
- A separate test logs in with a real TOTP code (200) and a wrong one (401).

**Recommended follow-up:** if any secret may have been read, ask affected users to disable and re-enable 2FA.

### 2. New API — `/api/v1/me`

Mounted in `app.ts`, with `authenticate` + `tenantResolver` on the router (`routes/meRoutes.ts`).

- **No route takes a user ID.** Every handler acts on `req.user`, so there is nothing to tamper with to reach a colleague's record.
- **No extra permission is needed:** every employee manages their own profile.

| Method & path | Purpose |
|---|---|
| `GET /me/profile` | Own `User` record with role, branch, department, designation and manager populated. PAN, Aadhaar and UAN are **masked** to the last 4 characters. Never includes the password hash, 2FA secret, lockout counters or audit trail. |
| `PATCH /me/profile` | Updates **only** `mobileNumber`, `profilePictureUrl`, `bloodGroup`, `maritalStatus` and the current/permanent address fields. Any other key (name, email, PAN, `tenantId`, `roleId`…) is rejected with 400, because the schema is `.strict()`. |
| `GET /me/details` | Family members, emergency contacts, family info, education, certifications, courses, experience, skills |
| `PUT /me/details/:section` | Replaces one section. `section` is one of `familyMembers`, `emergencyContacts`, `familyInfo`, `education`, `certifications`, `courses`, `experience`, `skills`. Body: `{ [section]: [...] }` or the bare array/object. Unknown section → 404. |
| `GET /me/bank` | Own bank record from `BankPayrollInfo` (captured in hiring step 7), **read-only**. The account number arrives masked by the model (`XXXXXX1234`). Returns `{ data: null }` if none exists. |

**Rules enforced (Zod, `controllers/meController.ts`):**

- Each list holds at most 25 entries. Required fields per row (e.g. family `name` + `relationship`). Text length caps throughout.
- Phone numbers, emails, enums (gender, blood group, education mode, skill level), years 1950–2100.
- Experience `endDate` ≥ `startDate`.
- At most one **primary** emergency contact.
- Empty strings from forms are treated as "not provided".

**Fallback:** until the employee first saves their emergency contacts, `GET /me/details` shows the single contact captured at onboarding (`User.emergencyContact*`), so the page isn't empty.

### 3. New model — `EmployeeProfileDetail`

One document per employee (`{ tenantId, userId }` unique), holding the sections listed above as sub-document arrays. Each row has its own `_id`, so the UI can edit or delete a single row.

- Tenant-isolated through `tenantPlugin`, with an audit trail through `auditPlugin`.
- Created on first save (upsert); no migration needed.

### 4. Design decisions

- **HR-owned fields are read-only for employees.** Name, email, DOB, gender, PAN, Aadhaar, UAN, employee code, joining date and org placement can't be self-edited: they feed payroll, statutory filings and access control. Competitors (Zoho People, HROne) route such changes through an HR approval; proposed as slice 1E.
- **Bank details are read-only for employees.** Changing a salary account is the classic payroll-fraud vector, so it should go through HR verification (also 1E).
- **Each section is replaced as a whole** (`PUT` with the full list) rather than per row. That keeps the API small and makes concurrent edits on one person's profile predictable. If two devices edit the same section at the same moment, the last save wins.

### 5. Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | Pass |
| New suite `src/tests/selfService/me.test.ts` | **9/9 pass** (one test added with slice 1B) |
| Full backend suite (clean build, SMTP blanked) | 250/258; the same **8 pre-existing** failures as Phase 0. No regressions |

The suite covers:

- dialog payloads with blank optional fields, and re-saving rows returned by the server
- secret absent on 5 endpoints
- 2FA login with good and bad codes
- PAN masking
- allowed vs forbidden profile fields, and bad phone numbers
- section save with row IDs
- missing required field, more than 25 rows, inverted dates, two primary contacts, unknown section
- per-employee privacy
- onboarding fallback
- 401 without login

### 6. Deployment and rollback

- **Deploy:** backend only; no migration.
- **Rollback:** redeploy the previous build. `EmployeeProfileDetail` documents are ignored by old code. Rolling back **re-opens the 2FA-secret leak**, so roll forward instead if at all possible.

---

## Slice 1C — experience fields

`EmployeeProfileDetail.experience[]` and its Zod schema (`controllers/meController.ts`) gained these fields, needed by the Experience tab design:

- `industry`, `companyWebsite`
- `referenceName`, `referencePhone`, `referenceEmail` (phone and email validated; email lower-cased)

A blank `endDate` means the role is current. No migration: the fields are optional.

**Tests:** `me.test.ts` saves a full experience row (blank end date, all new fields) and rejects an invalid reference email. 9/9 pass.

The frontend side of this slice is the unified My Profile page; see the frontend Phase 1 doc.

---

## Slice 1C-2 — pay, expenses and leave

### 1. Critical: every employee could read the whole company's payroll

- **Problem:** `getSalarySlips` and `getExpenses` (`controllers/financeController.ts`) limited employees to their own records with `if (req.user.role === 'Employee')`. `User` has **no `role` field** (only `roleId`), so the condition was never true. Neither route has a permission check, so any logged-in employee could list **every colleague's salary slips and expense claims**.
- **Fix:** a new `canViewAllFinance(req)` grants the full list only with `FINANCE_READ`, `*`, `SUPER_ADMIN` or the super-admin tenant. Everyone else gets their own records only. Employees also see only **issued** slips (`Generated` / `Paid`), never `Draft`.
- **Test:** an employee without `FINANCE_READ` sees only their own slips and expenses; a finance user sees all.

### 2. High: expense claims could be filed as already approved

- **Problem:** `createExpense` spread `req.body`, so an employee could submit `status: 'Approved'`, set approver comments, or file under another `employeeId`.
- **Fix:** whitelist only `type`, `amount`, `date`, `description` and `receiptUrl`. In addition:
  - amount must be greater than 0;
  - the date must be valid and not in the future;
  - `receiptUrl` must point to our own storage (`isOwnUploadUrl`);
  - an invalid type returns 400 instead of 500.

### 3. Leave application hardening (`applyLeave`)

**Rejected now (400 unless noted):**

| Check | Before |
|---|---|
| Leave type must be an active type of **the caller's company** | Any ID accepted, including another company's |
| Dates must be valid | `Invalid Date` was stored |
| Reason at most 1000 characters | No limit |
| No overlap with an existing pending/approved request (**409**) | Overlapping requests allowed |

**New optional fields** (on `LeaveRequest`):

- **Half day:** `isHalfDay` + `halfDaySession`. Start and end must be the same day, and the session is required. Counted as **0.5 days** in balances.
- **Contact during leave:** `contactNumber` / `contactEmail`, validated.
- **Attachment:** `attachmentUrl`, which must be one of our own uploads.

**Day counting:** both controllers had a copy of the day-count helper. They now share one `leaveDays()` (`utils/leaveDays.ts`) that understands half days.

**Deliberately not enforced:** leave balance. Many companies allow loss-of-pay beyond the balance; that is a policy setting for later. The form warns the employee instead.

### 4. New: `GET /me/salary-structure`

The finance endpoint requires `FINANCE_READ`, so employees couldn't see their own pay structure. The new route returns the caller's own monthly components plus monthly gross, deductions, net and annual gross.

### 5. Uploads

`isOwnUploadUrl()` (`utils/fileStorage.ts`) accepts only URLs this backend issued: Cloudinary under our cloud name, or `/uploads/`. Leave attachments and expense receipts are now uploaded as **multipart** through `/upload` (type allow-list, 5 MB, moderation), not as base64 inside JSON.

### Verification

| Check | Result |
|---|---|
| `src/tests/selfService/payAndLeave.test.ts` | **8/8 pass** |
| `tsc --noEmit` | Pass |
| Full backend suite (clean build, SMTP blanked) | 259/267; the same **8 pre-existing** failures. No regressions. (One earlier run also failed `super-admin platform endpoints` during setup under heavy machine load; it passes 10/10 alone and in the re-run.) |

The suite covers:

- payroll scoping (own vs. finance) and drafts hidden
- own salary structure only
- expense self-approval blocked, zero amount, bad type, future date, foreign receipt
- leave: foreign/invalid type, bad dates, overlap (409), adjacent days allowed
- half-day rules and **0.5-day balance**, contact validation, foreign attachment

---

## Slice 1E — HR-approved profile changes (product decision: "HR approval for any changes")

### How it works

1. **Employee requests.** `POST /me/change-requests` with `{ kind, changes, comment?, attachmentUrl? }`:
   - `kind: 'identity'`: first/last name, date of birth, gender, PAN, Aadhaar, UAN.
   - `kind: 'bank'`: bank name, account holder, account number, IFSC, branch, account type, MICR.
2. **HR reviews.** `GET /change-requests?status=…`, `GET /change-requests/:id` and `PUT /change-requests/:id/review` `{ decision, comment }`, on a new router that requires **`EMPLOYEE_WRITE`**.
3. **Approval applies the change.**
   - Identity changes update the `User` record.
   - Bank changes update `BankPayrollInfo` through `save()`, so its encryption hook runs. The record is also marked **Verified**, with the reviewer's name and date.
4. **The employee sees status and can cancel.** `GET /me/change-requests`, `POST /me/change-requests/:id/cancel` (own requests, pending only).

### Rules (enforced server-side)

**What can be requested:**

- Formats are validated:
  - PAN: `ABCDE1234F`
  - Aadhaar and UAN: 12 digits
  - IFSC: `ABCD0XXXXXX`
  - account number: 6–18 digits
  - MICR: 9 digits
  - date of birth: 14–100 years ago
- Any other field (e.g. login email) is rejected.
- Only values that actually differ are recorded; a request that changes nothing → 400.
- At most **one pending request per kind** per employee → 409.
- A proof attachment must be one of our own uploads.

**How data is protected:**

- Proposed values are stored **encrypted** (`proposedEncrypted`, `select: false`).
- Lists show masked values only (e.g. `XXXXXX222B`).
- Only the reviewer's detail view decrypts them, so HR can check them against the proof; that access is audit-logged.

**Review:**

- **Nobody can review their own request** (403). A salary-account change always needs a second person.
- Rejection requires a reason. A request can't be reviewed twice (409).
- A bank change for an employee with no bank record → 409, and the request **stays pending**. That record needs a hiring candidate link, so HR creates it in payroll setup first.
- Every step writes an audit log entry: requested, viewed, approved, rejected.

### Security finding fixed: encryption fell back to a key in the source code

`utils/encryption.ts` used `ENCRYPTION_KEY || 'default_secret_key_32_chars_long'`. The key isn't set in this environment's `.env` and wasn't in `.env.example`, so every encrypted value is readable by anyone with the repository:

- bank account numbers, PAN and Aadhaar;
- AI provider API keys and integration credentials;
- resume text and AI summaries.

**Fix** (a non-breaking migration path):

- `ENCRYPTION_KEY` must be exactly 32 bytes when set.
- Production logs a loud **[SECURITY]** error when it isn't set.
- New values are encrypted with the configured key. Old values still **decrypt through a legacy fallback**, so nothing becomes unreadable.
- `scripts/reencryptSensitiveData.ts` re-encrypts every legacy value on the new key. It covers `bankpayrollinfos`, `employeeaisummaries`, `platformaiproviders`, `resumescreenings`, `profilechangerequests` and integration credentials. It is idempotent, dry-run by default (`--apply` to write), and refuses to run without a key.
- `.env.example` documents the variable and how to generate it.

**Required action** (per environment):

1. Generate a key: `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`.
2. Set it as `ENCRYPTION_KEY` and back up the database.
3. Run `npx ts-node scripts/reencryptSensitiveData.ts`, check the counts, then run it again with `--apply`.

**Never change the key again without re-running the script.**

### Verification

| Check | Result |
|---|---|
| `src/tests/selfService/changeRequests.test.ts` | **5/5 pass** |
| Full backend suite (clean build, SMTP blanked) | 274/282; the same **8 pre-existing** failures. No regressions. (An earlier run under heavy load showed extra suite-level setup failures; every one passed when re-run alone and in the full re-run.) |

The suite covers:

- encrypted at rest and masked in summaries; nothing applied before approval
- one pending per kind; reviewer sees the full value; reject needs a reason; no double review
- formats, disallowed fields, no-op requests, foreign attachments
- self-review blocked; employees can't list; other company 404
- bank: no record → 409 and still pending; approved account number stored encrypted and marked Verified
- cancel own only

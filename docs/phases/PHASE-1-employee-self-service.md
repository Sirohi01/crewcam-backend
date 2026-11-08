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
| 1B | Frontend: wire My Profile, Family, Emergency, Education, Bank Details to `/me` | Next |
| 1C | Leave, attendance, payslip, reimbursement pages; move webcam/attachment uploads off base64 JSON | Planned |
| 1D | My Requests, My Tasks, Policies, Helpdesk, Notifications, Assets, Training | Planned |
| 1E | HR approval flow for HR-owned profile fields (name, DOB, PAN, bank…) | Proposed |

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
| New suite `src/tests/selfService/me.test.ts` | **8/8 pass** |
| Full backend suite (clean build, SMTP blanked) | 250/258; the same **8 pre-existing** failures as Phase 0. No regressions |

The suite covers:

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

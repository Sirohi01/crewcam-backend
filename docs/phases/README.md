# CrewCam — phase tracker

All phases are developed on branch **`agent_changes`** in each repo (crewcam-backend, crewcam-frontend, hrcrm-superadmin). Each phase is one or more commits starting with `Phase N:`, with a write-up in that repo's `docs/phases/`. This file is the cross-repo index.

| Phase | Scope | Status | Docs |
|---|---|---|---|
| 0 | Security & tenant-isolation hardening | ✅ Done (commits `8e7d02b` backend, `d214628` frontend) | [PHASE-0-hardening.md](PHASE-0-hardening.md), frontend `docs/phases/PHASE-0-hardening.md` |
| 7A | Payment Obligations add-on switch (+ add-on gating fix for all modules) | ✅ Done | [PHASE-7A-payment-obligations-toggle.md](PHASE-7A-payment-obligations-toggle.md) |
| 1 | Employee self-service: wire the static `(workspace)` pages to real APIs | 🚧 In progress (1A `/me` API + 2FA-secret fix ✅, 1B profile pages ✅, 1C unified My Profile ✅, 1C-2 pay/leave/expenses + payroll leak fix ✅, 1C-3 attendance rules + 2 MB body limit ✅, 1D-1 helpdesk/notifications/tasks + notification leak + wildcard feature-gate fix ✅; next 1D-2 policies, requests, documents, assets, SOS) | [PHASE-1-employee-self-service.md](PHASE-1-employee-self-service.md) |
| D1 | Product decisions: WhatsApp/KPI permissions, Bharat Organic tenant, optional add-on prices | ✅ Done | [DECISIONS-1.md](DECISIONS-1.md) |
| 1E | HR approval for HR-owned profile changes (name, DOB, PAN, bank…) + encryption-key hardening | ✅ Done | [PHASE-1-employee-self-service.md](PHASE-1-employee-self-service.md) |
| 4-F | Payroll country catalogue (India seeded, others manageable from Super Admin) | ✅ Done | [PHASE-4F-payroll-countries.md](PHASE-4F-payroll-countries.md) |
| 2 | Org-setup static sub-pages (structure, budgets, cost centres, audit trail…) | Planned | |
| 3 | Lifecycle port from legacy: disciplinary, exit / F&F, letters | Planned | |
| 5 | Super admin completion (technical access, activity log, terms, catalogue consolidation) | Planned | |
| 4 | Payroll & statutory compliance (India) | Planned | |
| 6 | Competitive features (workflow builder, rostering, surveys, 360°, reports) | Planned | |
| 7 | Payment Obligations module screens and data | Planned (switch already in place) | |
| 8 | Platform: SSO, API keys / webhooks, CI, monitoring | Planned | |

## Standing facts for anyone working on these phases

- **Test baseline:** 8 backend tests fail on the base commit and are not regressions (listed in PHASE-0 §5). Run the suite from a clean build (`tsc --outDir <tmp>`) with SMTP env vars blanked.
- **Routes live only in `src/app.ts`.** `server.ts` must not register middleware or routes (see PHASE-0 §3.4).
- **Tenant isolation is enforced by `models/plugins/tenantPlugin.ts`.** Every query and aggregate on a tenant model must filter by `tenantId`.
- **Feature checks go through `utils/featureKeys.ts`.** Never compare package entries directly; they can be IDs.

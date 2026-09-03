# Requirements

> Functional, technical, and non-functional requirements for TimeTracking.
> Initial version populated by `/gsd-t-scan` 2026-05-08 by reading `REQUIREMENTS.md` (legacy spec, ~1500 lines), `BUSINESS_RULES_SUMMARY.md`, `businessRules.md`, and the codebase. Detailed enforcement gap analysis at `.gsd-t/scan/business-rules.md`.
> Re-scanned `/gsd-t-scan` 2026-08-13 (955 files, 68 routes, 10 feature-domain slices) - see "Scan Findings - Confirmed Gaps (2026-08-13 Deep Scan)" below. Confirms several 2026-06-04 findings are still open (SCAN-SEC-01, SCAN-FE-03, SCAN-TEST-04) and adds new findings, most notably: the CLI (`tt`) is non-functional against production (SCAN-CLI-03/04/05), invoice/dashboard totals ignore the per-task billable flag (SCAN-DATA-11), and core docs (architecture.md, README.md, CLAUDE.md) still describe the decommissioned Cloud Run/Supabase stack instead of the current Vercel/Neon production stack (SCAN2-DOC-01/02).

The legacy `REQUIREMENTS.md` (project root) remains the canonical functional spec; this file is the GSD-T-managed digest plus enforcement status.

## Functional Requirements

### F1. Time Entry (REQ-TIME-*)
| Capability | Enforced? | Where |
|------------|-----------|-------|
| Log time per day per project | ✅ | `server/src/index.ts:888` |
| Cannot log future dates | ✅ | `index.ts:900-902` |
| Description >= 10 characters | ✅ | `index.ts:904-906` |
| Hours > 0 | ✅ | `index.ts:907` |
| Hours <= 24 (upper bound) | ❌ | No upper bound; NaN/Infinity not rejected (SCAN-DATA-07) |
| Must be assigned to project (or override) | ✅ | v1.21 cross-assignment override implemented |
| MEMBER can only log own time (not other users') | ❌ | Server never checks requester identity vs. userId (SCAN-RBAC-01) |
| Snapshot rate + role at insert (immutable history) | ✅ | `index.ts:880` (`hourly_rate_snapshot`) |
| Dashboard cost uses snapshot (not live rate) | ❌ | Dashboard.tsx uses live `user.hourlyRate` (SCAN-DATA-05) |
| Module required unless Stage="Proposal" | ❌ | client-only HTML5 required; bypassed via handlePanelSave path (SCAN-FE-09) |
| Designation auto-populates if single role on project | ✅ | client-side + server fallback |
| AI-improve task description (Gemini) | ✅ | `index.ts:2304` |
| AI endpoint must have rate limiting | ❌ | No rate limiter (SCAN-SEC-07) |
| Per-task `billable` flag exists and is stored | ✅ | `index.ts:1007,1391,1627` (defaults true; forced false for the internal project) |
| Invoice Sheet / Dashboard cost+hours aggregation must respect per-task `billable` flag | ❌ | Neither filters by `billable`; non-billable task hours are still summed into invoiced totals and dashboard KPIs (SCAN-DATA-11) |

### F2. Project Management (REQ-PROJ-*)
| Capability | Enforced? | Where |
|------------|-----------|-------|
| Create / edit / delete project (ADMIN only per docs) | ⚠️ partial | server allows any authenticated user (TD-001/TD-010) |
| End date > start date | ✅ | `index.ts:1140–1142, 1225–1227` |
| ≥ 1 module | ✅ | `index.ts:1145–1147, 1230–1232` |
| ≥ 1 user assignment | ✅ | `index.ts:1150–1152, 1235–1237` |
| Cannot delete Internal project | ✅ | `index.ts:1303–1305` |
| Cannot delete project with time entries | ✅ | `index.ts:1308–1311` |
| Super Admin auto-assigned to all projects | ✅ | `index.ts:1173–1182, 1250–1259` |
| Manager auto-assigned to projects they create | ✅ | `index.ts:1165–1171` |
| Project status auto-calc (Future/Open/Closed) | ❌ | not in schema; client-side only (TD-027) |
| MANAGER cannot delete projects | ❌ | not enforced (TD-001/TD-010) |

### F3. Client Management (REQ-CLIENT-*)
| Capability | Enforced? |
|------------|-----------|
| Cannot delete Internal client | ✅ |
| Cannot delete client with projects | ✅ |
| MANAGER/MEMBER restricted to `assignedClientIds` | ❌ field exists, never queried (TD-001) |

### F4. Team / User Management (REQ-USER-*)
| Capability | Enforced? |
|------------|-----------|
| Cannot delete self | ✅ |
| Cannot delete the last ADMIN | ✅ |
| Email uniqueness | ✅ (DB constraint) |
| Welcome email + 24h setup token on create | ✅ |
| First Google-OAuth user becomes ADMIN | ✅ |
| ADMIN-only user creation | ❌ any auth user can create (TD-002) |
| Email verification before activation | ❌ (TD-023) |

### F5. Authentication / Session (REQ-AUTH-*)
| Capability | Enforced? |
|------------|-----------|
| Local + Google OAuth login | ✅ |
| Password >= 8 chars | ✅ |
| Session 24h | ✅ |
| Reset token 1h | ✅ |
| Setup token 24h | ✅ |
| Login rate limiting (5/IP/15min) | ✅ | `server/src/middleware/rate-limit.ts:56` |
| Password reset rate limiting (3/email/1h) | ✅ | `server/src/middleware/rate-limit.ts:76` |
| Registration rate limiting | ❌ | `POST /auth/register` has no rate limiter (SCAN-SEC-04) |
| Auth responses strip sensitive columns | ❌ | `/auth/login`, `/auth/register`, `POST /api/users` return raw DB rows including `password_hash`, `reset_token` (SCAN-SEC-02) |
| `/api/auth/debug` requires authentication | ❌ | No `isAuth` middleware; returns full user row to unauthenticated callers (SCAN-SEC-01) |
| Login error messages must be generic | ❌ | Three distinct messages enable user enumeration (SCAN-SEC-03) |
| Strong cookie signing key required | ❌ | Falls back to `'secret_key'` (TD-007) |
| `reset_token_expires` stored as TIMESTAMPTZ | ❌ | Stored as bare `TIMESTAMP`; comparison with `NOW()` (TIMESTAMPTZ) is session-timezone-dependent (SCAN-DATA-08) |

### F6. Authorization / RBAC (REQ-ACCESS-*)
**Status: documented but not enforced. See TD-001 — single highest-priority item in the register.**
| Role | Documented as able to | Actually able to in code |
|------|----------------------|--------------------------|
| ADMIN | Everything | Everything (correct) |
| MANAGER | Create/edit projects for assigned clients; not delete projects; manage assigned-client team | Anything an ADMIN can do |
| MEMBER | Own time entries; own profile; no financials | Anything an ADMIN can do |

### F7. Audit (REQ-AUDIT-*)
| Capability | Enforced? |
|------------|-----------|
| Log every CREATE/UPDATE/DELETE on key tables | ✅ |
| JSONB before/after | ✅ |
| Capture user, IP, user-agent, test-mode flag | ✅ |
| UI to read audit log | ❌ (TD-029) |
| Audit password resets | ❌ (TD-034) |

### F8. Notifications (REQ-NOTIF-*)
| Capability | Enforced? |
|------------|-----------|
| Welcome email on user creation | ✅ |
| Password reset email | ✅ |
| Overtime alert email (one per user per day) | ❌ dedup is in-memory only (`overtimeEmailsSent` Map at `index.ts:538`); resets on Cloud Run container restart; duplicate emails sent after cold start (SCAN-TEST-20) |
| Cross-assignment notification email | ✅ | v1.21 `sendCrossAssignmentNotificationEmail`; best-effort (failure logged, does not roll back save) |

## Technical Requirements

- **Language / runtime**: TypeScript on both ends; Node >= 20.
- **Frontend build**: Vite 5; React 19 with strict mode; no router library (deep linking unsupported).
- **Backend**: Express 4 (single-file `server/src/index.ts`); Passport for auth; raw `pg` queries (no ORM).
- **Database**: PostgreSQL via Supabase; pool max 15 (`db.ts:25`); native types; SSL required for Supabase, disabled only for local dev via `sslmode=disable`.
- **Deployment**: Google Cloud Run, two independent services (`timetracking-frontend` nginx-served SPA, `timetracking-api` Express); deployed via Cloud Build (`cloudbuild.yaml`). Project `timetracker-481722`, region `us-central1`. Custom domain `timesheet.tekyz.com` fronted by Cloudflare.
- **Tests**: Playwright E2E (29 Playwright projects, 205+ `@smoke` + 165 `@regression` tagged tests) + Vitest unit tests (39 root-level + 25 CLI; `npm run test:unit`). Visual snapshot baselines MUST be generated in `mcr.microsoft.com/playwright:v1.57.0-jammy` Docker (IMP-003) - macOS `-darwin` baselines are prohibited and cause false CI failures.
- **API spec**: Swagger / OpenAPI configured (`server/src/swagger.ts`, `server/src/swagger-paths.ts`); UI at `/api-docs`.
- **CLI**: `cli/`, binary `tt`; reuses cookie-session auth. **Installed by cloning this repository** — never published to npm, and `package.json` sets `"private": true`. Also accepts an agent token via `TT_API_TOKEN` (v1.25).
- **AI**: `@google/genai` (Gemini `gemini-3-flash-preview`), gated by `API_KEY` env var; `POST /api/ai/improve` endpoint; no rate limiting on this endpoint (confirmed gap, scan finding).
- **Rate limiting**: Login: 5 attempts per IP per 15-minute window (`loginLimiter` in `server/src/middleware/rate-limit.ts`). Password reset: 3 per email per 1-hour window (`passwordResetLimiter`). Playwright UA bypass active on non-production hosts only (TD-045). Registration endpoint has no rate limit (confirmed gap).
- **Session**: `cookie-session` with `JWT_SECRET` from Secret Manager; 24-hour maxAge.
- **Transactions**: Dedicated pool client required for multi-statement operations (`getPool().connect()`); `pool.query()` alone is NOT safe for BEGIN/COMMIT because pool selects a different idle connection per call. See confirmed CRITICAL finding: "Transactions use shared Pool.query()." The delete-test-data endpoint at `index.ts:3566` demonstrates the correct pattern.
- **Schema bootstrap**: `initDb()` in `db.ts` checks `information_schema.tables` for `tb_users` existence before applying `SCHEMA_SQL`; runs 12+ sequential migrations without a wrapping transaction (confirmed HIGH gap - mid-migration failure leaves partial schema and server starts anyway).
- **CORS**: Hardcoded `ALLOWED_ORIGINS` list (`index.ts:69-76`); `CLIENT_URL` env var is informational only and no longer affects CORS enforcement. Production origins: `timesheet.tekyz.com` and the Cloud Run URL.

## Non-Functional Requirements

| Property | Target / current state |
|----------|------------------------|
| Availability | Inherits Cloud Run SLA (99.95% monthly); `--min-instances=0` on both services (cold start possible); no app-level uptime target documented |
| Latency | No documented budget; dashboard aggregates in-memory from up to 1000 entries (no DB pagination on primary query); no caching layer |
| Security | Multiple CRITICAL and HIGH gaps confirmed by scan (see Scan Findings section below); sensitive column scrubbing missing from auth responses and audit log |
| Auditability | Strong (every CREATE/UPDATE/DELETE logged to `tb_audit_log` with JSONB before/after, user, IP, user-agent); no UI to browse audit log (TD-029); `password_hash`, `reset_token`, `reset_token_expires` captured verbatim into audit `before_values` (confirmed HIGH finding) |
| Compliance / data retention | Not specified |
| Internationalization | None (English-only); dates stored as bare PostgreSQL `DATE`; UTC-midnight split for default date is wrong in UTC-negative timezones (confirmed MEDIUM finding) |
| Accessibility | `@axe-core/playwright` integrated; 6 a11y spec files assert `toBeDefined()` instead of `toHaveLength(0)` - violations logged but never fail tests (confirmed HIGH finding); fix deferred from v1.12 still not applied at v1.21 |
| Scale ceiling | Pool=15 + no pagination + no cache; comfortable below 50 concurrent users; `--max-instances=2` on Cloud Run |
| CI test coverage | Only `@smoke` tests run in Cloud Build step 9 (`--grep @smoke`); 165 `@regression` tests covering audit, rate-limit, and RBAC negative paths never run in CI (confirmed HIGH finding) |

## Scan Findings - Confirmed Gaps (2026-06-04 Deep Scan)

The following requirements gaps and defects were confirmed by the v1.21 deep scan. Items marked 🔴 CRITICAL or 🟠 HIGH are blocking quality gates until resolved.

**Status note (2026-08-13 re-scan):** SCAN-SEC-01 (`/api/auth/debug`) is CONFIRMED STILL OPEN and worse than originally scoped - the endpoint now leaks the full raw session-user row (`password_hash`, `reset_token`, `reset_token_expires`, rates) to any unauthenticated caller, and `components/Login.tsx`'s public "Troubleshoot Auth" button renders that raw JSON on-screen. See the 2026-08-13 section below for the full current-state writeup and additional findings discovered since this section was written (billable-flag invoicing gap, CLI regressions, MANAGER delete-time-entry scope gap, and others).

### Security and Authentication Gaps

| ID | Severity | Requirement (as-should-be) | Current State | File(s) |
|----|----------|---------------------------|---------------|---------|
| SCAN-SEC-01 | 🔴 CRITICAL | `GET /api/auth/debug` must require authentication; response must strip `password_hash`, `reset_token`, `reset_token_expires`, `auth_id` | No `isAuth` middleware; returns full `req.user` row including sensitive columns; "Troubleshoot Auth" button visible to unauthenticated users in Login.tsx | `server/src/index.ts:269`, `components/Login.tsx:51` |
| SCAN-SEC-02 | 🟠 HIGH | Auth responses (`/auth/login`, `/auth/register`, `POST /api/users`) must return a safe DTO, not raw DB rows | All three endpoints return `req.user` or `INSERT ... RETURNING *` which includes `password_hash`, `reset_token`, `auth_id`; `/auth/me` already does this correctly and is the model to follow | `server/src/index.ts:314,434,1470` |
| SCAN-SEC-03 | 🟠 HIGH | LocalStrategy error messages must be generic ("Invalid email or password.") to prevent user enumeration | Three distinct messages: "Incorrect email.", "This account uses Google Login.", "Incorrect password." reveal account existence and auth method | `server/src/index.ts:226-236` |
| SCAN-SEC-04 | 🟠 HIGH | `POST /api/auth/register` must have rate limiting; must return generic response on duplicate email | No rate limiter; returns "Email already registered." (confirms existence) or "Password added to existing account." (confirms Google-federated account) | `server/src/index.ts:380-434` |
| SCAN-SEC-05 | 🟠 HIGH | `fetchBeforeState` for `tb_users` must strip `password_hash`, `reset_token`, `reset_token_expires` before storing in `tb_audit_log.before_values` | `SELECT *` result stored verbatim in audit JSONB | `server/src/audit.ts:107` |
| SCAN-SEC-06 | 🟠 HIGH | SCHEMA_SQL auto-recovery in OAuth strategy must check for PostgreSQL error code `42P01` specifically, not substring match on "does not exist" | Substring match on any error message containing "does not exist" triggers full `DROP TABLE ... CASCADE` + re-seed; executes on every OAuth login attempt where any query error occurs | `server/src/index.ts:163-170` |
| SCAN-SEC-07 | 🟠 HIGH | `POST /api/ai/improve` must have rate limiting to prevent cost amplification | No rate limiter applied; `isAuth` only | `server/src/index.ts:2304` |
| SCAN-SEC-08 | MEDIUM | `clientScopeFilter` `columnRef` parameter must be validated against an allowlist | Parameter interpolated directly into SQL fragment with no validation; currently safe (all callers use hardcoded literals) but is a latent injection footgun | `server/src/middleware/auth.ts:151,181,188` |
| SCAN-SEC-09 | MEDIUM | `idColumn` parameter in `fetchBeforeState`/`fetchBeforeStates` must be validated against an allowlist | Interpolated into SQL WHERE clause with no validation; currently all callers use default `'id'` | `server/src/audit.ts:107,133` |
| SCAN-SEC-10 | MEDIUM | `GOOGLE_CLIENT_ID` in `cloudbuild.yaml` must use a substitution variable or Secret Manager reference | Hardcoded OAuth Client ID committed to VCS at lines 36 and 101 | `cloudbuild.yaml:36,101` |

### Authorization (RBAC) Enforcement Gaps

| ID | Severity | Requirement (as-should-be) | Current State | File(s) |
|----|----------|---------------------------|---------------|---------|
| SCAN-RBAC-01 | 🟠 HIGH | MEMBER must not be able to POST time entries for other users (`own only` rule per RBAC contract §3.5) | No guard checks `requester.access_level === 'MEMBER' && requester.id !== userId`; a MEMBER can log hours under any other user's identity on a shared project | `server/src/index.ts:888` |

### Data Integrity and Transaction Safety

| ID | Severity | Requirement (as-should-be) | Current State | File(s) |
|----|----------|---------------------------|---------------|---------|
| SCAN-DATA-01 | 🔴 CRITICAL | All multi-statement operations must use a dedicated pool client (`getPool().connect()`) for BEGIN/COMMIT/ROLLBACK | `pool.query()` used for BEGIN, INSERTs, and COMMIT in four transaction blocks (POST /api/users, PUT /api/users/:id, POST /api/projects, PUT /api/projects/:id); statements can land on different connections | `server/src/index.ts:1435,1566,2013,2160` |
| SCAN-DATA-02 | 🟠 HIGH | Migration runner must fail fast on any DDL error and prevent server startup with a partial schema | Outer `try/catch` at `db.ts:439` swallows migration errors with `console.error`; server starts normally on partial migration | `server/src/db.ts:439` |
| SCAN-DATA-03 | 🟠 HIGH | `designation_id` on `tb_project_assignments` must be NOT NULL with a three-column PK on upgraded (non-fresh-boot) databases | Migration 10f adds column as `TEXT NULL`; PK reshape deferred with a comment; upgraded DBs have a different schema than fresh-boot DBs | `server/src/db.ts:353`, `server/src/schema.ts:282` |
| SCAN-DATA-04 | 🟠 HIGH | `POST /api/leave` must propagate `x-test-mode` header to set `is_test = true` on inserted rows | `x-test-mode` header ignored; `is_test` always defaults to `FALSE`; test leave rows can never be swept by delete-test-data cleanup | `server/src/index.ts:3328-3384` |
| SCAN-DATA-05 | 🟠 HIGH | Dashboard cost calculations must use `hourlyRateSnapshot` (frozen at entry time), not live `user.hourlyRate` | `entry.hours * (user?.hourlyRate || 0)` used at Dashboard.tsx:43,54; changing a user's rate retroactively reprices all historical entries | `components/Dashboard.tsx:43,54` |
| SCAN-DATA-06 | 🟠 HIGH | PUT /api/time-entries overtime and leave-guard calculations must use original entry date when date is changed | `date` column not fetched in the initial SELECT at `index.ts:1161`; overtime check uses new date + `diff` hours instead of checking both old and new dates | `server/src/index.ts:1161` |
| SCAN-DATA-07 | 🟠 HIGH | Hours field must have an upper bound (max 24) and must reject `NaN`/`Infinity` | POST and PUT validate only `hours > 0`; no upper bound; `parseFloat` can produce `Infinity` | `server/src/index.ts:907,1152` |
| SCAN-DATA-08 | MEDIUM | `reset_token_expires` column must be `TIMESTAMPTZ` (not bare `TIMESTAMP`) to avoid timezone-dependent comparison errors with `NOW()` | Defined as `TIMESTAMP` in schema.ts and migration 3; PostgreSQL compares using session timezone which may differ from UTC on Supabase | `server/src/schema.ts:45`, `server/src/db.ts:90` |
| SCAN-DATA-09 | MEDIUM | `tb_weekly_unavailability` table DDL must be in `schema.ts` and `initDb()` migrations, not inline inside route handlers | `CREATE TABLE IF NOT EXISTS` runs inside GET and POST route handlers on every request | `server/src/index.ts:2977,2998` |
| SCAN-DATA-10 | MEDIUM | `tb_users` must not have duplicate timestamp columns (`created_at TIMESTAMP` and `created TIMESTAMPTZ`) without a documented deprecation plan | Both columns coexist on `tb_users`, `tb_time_entries`, `tb_sprints`, `tb_modules`, `tb_project_modules`, `tb_designations` | `server/src/schema.ts:47-48` |
| SCAN-DATA-11 | 🔴 EXTREME | Invoice Sheet and Dashboard cost/hours aggregation must exclude tasks with `billable = false` | Neither the invoice-sheet SQL (sums `k.hours`/`k.hours * u.cost_rate` for every task row) nor `Dashboard.tsx`'s cost/hours reducers filter by the per-task `billable` flag; non-billable work (e.g. internal meetings logged against a client project) is silently counted as billed/reported hours | `server/src/index.ts:3830-3856`, `components/Dashboard.tsx:41-65` |

### Frontend Logic Gaps

| ID | Severity | Requirement (as-should-be) | Current State | File(s) |
|----|----------|---------------------------|---------------|---------|
| SCAN-FE-01 | 🟠 HIGH | `handlePanelSave` in TimeEntryPanel must compute and include `crossAssignmentOverride` flag | `handleSubmit` computes the flag (lines 535-546); `handlePanelSave` (lines 569-603) builds an identical payload without it; saves via the dirty-confirm dialog lose the override | `components/TimeEntryPanel.tsx` |
| SCAN-FE-02 | 🟠 HIGH | `LeaveCalendar.loadLeave` must be cancellable to prevent stale data overwriting current month on rapid navigation | No `AbortController` or `cancelled` flag; `LeaveCalendarPanel` already implements the correct pattern at lines 153-185 | `components/LeaveCalendar.tsx:109-126` |
| SCAN-FE-03 | 🟠 HIGH | `Clients.tsx` `FloatingLabelInput` must use `value` (controlled) not `defaultValue` (uncontrolled) | `defaultValue={value}` causes stale data to appear when switching between clients without unmounting; `Team.tsx` does this correctly with `value={value}` | `components/Clients.tsx:21` |
| SCAN-FE-04 | 🟠 HIGH | Settings.tsx config fetch calls must use `VITE_API_URL` base (via `services/db.ts`) not hardcoded relative `/api/config` paths | Three raw `fetch('/api/config...')` calls bypass `services/db.ts`; relative paths resolve to the frontend service origin in Cloud Run production and always 404 | `components/Settings.tsx:92,119,124` |
| SCAN-FE-05 | 🟠 HIGH | `App.tsx fetchData()` must deduplicate concurrent calls (AbortController or in-flight guard) | No deduplication; rapid CRUD triggers concurrent `Promise.all` batches; whichever resolves last wins, potentially replacing fresh state with stale data | `App.tsx:115` |
| SCAN-FE-06 | 🟠 HIGH | `ConfirmModal` confirm button must be disabled while async delete is in flight | No loading state; double-click sends two DELETE requests for the same resource ID | `components/ConfirmModal.tsx:75`, `App.tsx:225,274,331` |
| SCAN-FE-07 | 🟠 HIGH | `Settings.tsx` Max Hours Per Day input must be a controlled component wired to `handleSaveConfig()` | `defaultValue={12}` with no state, no `onChange`, no inclusion in save; changes are never persisted | `components/Settings.tsx:168` |
| SCAN-FE-08 | MEDIUM | `TimeSheet` client filter change must reset the project filter | Changing `filterClient` leaves stale `filterProject` value set; no entries are shown with no user feedback | `components/TimeSheet.tsx:39-40,262` |
| SCAN-FE-09 | MEDIUM | `TimeEntryPanel` `validateForm()` must explicitly check `activityType` and `module` (not rely on HTML5 `required`) | HTML5 `required` is bypassed when `handlePanelSave` calls `validateForm()` directly without a form submit event | `components/TimeEntryPanel.tsx:484-494` |
| SCAN-FE-10 | MEDIUM | `availableModules` autocomplete must filter to the current user's own entries only | Aggregates modules from all users' entries matching the client; leaks module names from other users' work to MEMBER/MANAGER sessions | `components/TimeEntryPanel.tsx:343-349` |
| SCAN-FE-11 | MEDIUM | `toDateInputValue` and default-date initialization must use local date, not UTC `toISOString().split('T')[0]` | In UTC-negative timezones after ~7 PM, the default date shown is tomorrow (UTC date); entry may display wrong date in the date picker | `components/TimeEntryPanel.tsx:219-226,373` |
| SCAN-FE-12 | MEDIUM | `LeaveCalendarPanel` save and delete errors (non-409) must show user-visible error state | Non-409 save errors and all delete errors reach only `console.error` with no UI feedback | `components/LeaveCalendarPanel.tsx:239-267` |
| SCAN-FE-13 | MEDIUM | `LeaveCalendarPanel` load error must show an error state and disable Save to prevent accidental duplicate-create | Load errors clear the form silently; user may create a duplicate leave entry thinking none exists | `components/LeaveCalendarPanel.tsx:140-186` |
| SCAN-FE-14 | MEDIUM | `ProjectPanel` sprint Done toggle must update `projectSnapshot` after successful PATCH to prevent false dirty-check prompt on Cancel | `completedAt: new Date().toISOString()` updates local state but not snapshot; Cancel triggers the dirty dialog unnecessarily | `components/ProjectPanel.tsx:407` |
| SCAN-FE-15 | MEDIUM | `ProjectPanel` sprint Done toggle must have a per-row in-flight guard to prevent double-click race condition | Two rapid PATCH requests can diverge DB and FE sprint status with no reconciliation | `components/ProjectPanel.tsx` |
| SCAN-FE-16 | MEDIUM | `ProjectPanel.handleSubmit` must validate `name` (non-empty) and `clientId` (selected) | Only `startDate` and `modules` validated; empty name inserts as-is; missing `clientId` causes 500 on FK violation | `components/ProjectPanel.tsx:486` |
| SCAN-FE-17 | MEDIUM | Duplicate sprint names must be rejected client-side and server-side with a 400 response | UI has no dedup; server catches UNIQUE constraint violation as generic 500 with no user-facing explanation | `components/ProjectPanel.tsx`, `server/src/index.ts:2168-2179` |
| SCAN-FE-18 | MEDIUM | `POST /api/leave` must validate `half_day` and `leave_type` against allowed enums, returning 400 for invalid values | Truthiness-only check; invalid enum values reach the DB constraint and return a generic 500 | `server/src/index.ts:3339-3341` |
| SCAN-FE-19 | MEDIUM | Dashboard must receive `visibleEntries` (RBAC-filtered) not raw `timeEntries`, consistent with TimeSheet | `App.tsx:465` passes `timeEntries`; `App.tsx:448` passes `visibleEntries` to TimeSheet; inconsistent defense-in-depth | `App.tsx:465` |

### Backend API Client Gaps

| ID | Severity | Requirement (as-should-be) | Current State | File(s) |
|----|----------|---------------------------|---------------|---------|
| SCAN-API-01 | MEDIUM | `services/db.ts` `assignments.remove` must call `handleNotOk()` on non-2xx responses | Raw `fetch()` with no `res.ok` check; all HTTP errors silently ignored | `services/db.ts:375-383` |
| SCAN-API-02 | MEDIUM | `services/db.ts` `modules.delete` must call `handleNotOk()` for 401/403/429/5xx | Falls through to `res.json()` for all non-204, non-409 statuses; auth errors do not trigger registered callbacks | `services/db.ts:353-365` |
| SCAN-API-03 | MEDIUM | `/api/reports/by-designation` must either be wired into the Dashboard UI or removed; it must not run an all-time full table scan with no date-range parameter | Defined, tested, but never consumed by any frontend component; no date-range filter | `server/src/index.ts:2885`, `services/db.ts:229` |
| SCAN-API-04 | MEDIUM | Legacy `DELETE /api/test-cleanup` must delete `tb_leave` rows (is_test = true) | Does not include `tb_leave` in its cleanup sequence | `server/src/index.ts:3029` |
| SCAN-API-05 | MEDIUM | `GET /api/config` CORS Step 7 in `cloudbuild.yaml` must guard against empty `FRONTEND_URL` before passing it to `--set-env-vars` | No null-guard; empty URL corrupts `CLIENT_URL` env-var with trailing comma, breaking production CORS | `cloudbuild.yaml:77-103` |

### CLI Correctness Gaps

| ID | Severity | Requirement (as-should-be) | Current State | File(s) |
|----|----------|---------------------------|---------------|---------|
| SCAN-CLI-01 | 🟠 HIGH | `tt login` must issue a single HTTP request to `/auth/login` | Two separate POST requests sent: first via `apiFetch` for body parsing, second via raw `fetch` to harvest `Set-Cookie`; double audit log entries and double rate-limit consumption | `cli/src/commands/login.ts:61,79` |
| SCAN-CLI-02 | 🟠 HIGH | `tt login` password prompt on a real TTY must read the full password (not just the first character) | Raw mode `once('data', ...)` fires on first keypress; `readline` interface opened but unused for password; broken on any real TTY | `cli/src/commands/login.ts:15-33` |
| SCAN-CLI-03 | 🔴 CRITICAL | `tt login` must complete the two-step 2FA flow (`/auth/login` → prompt for emailed code → `/auth/verify-2fa`) since server-side 2FA shipped | `loginCommand` has no knowledge of `twoFactorRequired`/`/auth/verify-2fa`; treats any 200 from `/auth/login` as authenticated and tries to read `Set-Cookie` from that response, which is never set (2FA gate defers session creation to `/auth/verify-2fa`); every real `tt login` fails with "Server did not return a session cookie" | `cli/src/commands/login.ts:61-118`, `server/src/index.ts:414-450,458-497` |
| SCAN-CLI-04 | 🔴 CRITICAL | `resolveModule`/`resolveSprint` must unwrap the real wrapped response shapes (`{modules:[...]}`, `{sprints:[...]}`) before fuzzy-matching | Both call `.filter()` directly on the parsed body, which is an object not an array on the real server; throws an unhandled `TypeError`. Additionally `GET /api/modules` ignores the `project_id` query param server-side, so `--module` would fuzzy-match system-wide even once unwrapped | `cli/src/lib/resolver.ts:55-71`, `server/src/index.ts:3526-3554,3406-3428` |
| SCAN-CLI-05 | 🔴 CRITICAL | `tt log` must send the now-required `activityType` field on every POST /api/time-entries task | `logCommand`'s request body omits `activityType` entirely; server's `validateTasks` rejects every submission with 400 "Choose an activity type"; no CLI flag exists to supply one | `cli/src/commands/log.ts:59-80`, `server/src/index.ts:1027-1086` |
| SCAN-CLI-06 | 🟠 HIGH | `tt last` must read the per-task description from the real response shape (`tasks[].taskDescription`), not a nonexistent flat `taskDescription` field | `toTimeEntryResponse` has no top-level `taskDescription` (moved into `tasks: [...]` when multi-task entry shipped); `last.ts` reads the old flat field, which is always `undefined`, so `tt last` prints an empty description with no error | `cli/src/commands/last.ts:8-58`, `server/src/responseShapes.ts:88-137` |
| SCAN-CLI-07 | MEDIUM | `tt login` must extract the session cookie from the single request it already made, not issue a duplicate request | `loginCommand` calls `apiFetch` once to check success, discards the result, then re-POSTs the same credentials via a raw `fetch()` purely to read `Set-Cookie` headers; doubles login-rate-limit consumption and (once 2FA is wired) would double-send 2FA emails | `cli/src/commands/login.ts:61-100` |

**Root cause note (SCAN-CLI-03/04/05/06):** `cli/tests/fixtures/mock-server.ts` reimplements a stale, pre-2FA / pre-multi-task contract (immediate cookie on password, flat `taskDescription`, unwrapped array bodies, no `activityType` requirement) instead of the real server's current contract, so `npm run test` in `cli/` passes green while the shipped `tt` binary cannot complete a single login or log entry against production. The CLI was fully functional at v1.11.10 (2026-05-14); the server's 2FA (RULE-2FA-1) and multi-task time-entry (v1.24-era) changes were never propagated to the CLI or its mock fixtures.

### Test Quality and Data Hygiene Gaps

| ID | Severity | Requirement (as-should-be) | Current State | File(s) |
|----|----------|---------------------------|---------------|---------|
| SCAN-TEST-01 | 🔴 CRITICAL | `cross-assignment-rbac.spec.ts` must use a current or past date (not 2099) | `TEST_DATE = '2099-07-15'` is unconditionally rejected by the server future-date guard; all 6 tests receive 400 instead of 200 or 403 | `tests/cross-assignment-rbac.spec.ts:46` |
| SCAN-TEST-02 | 🟠 HIGH | `cross-assignment-rbac.spec.ts` MEMBER tests must use the session user's own ID (charlie/u3), not a different user's ID (dana/u4) | Member session is charlie (u3) but tests submit `userId=u4`; 403 fires for wrong reason (target user unassigned vs. requester unassigned) | `tests/cross-assignment-rbac.spec.ts:184-187` |
| SCAN-TEST-03 | 🟠 HIGH | `leave-rbac.spec.ts` MEMBER PUT/DELETE cross-user tests must use the `playwright` fixture, not `test.info()`, to obtain a second request context | `(test.info() as any).playwright?.request.newContext?.()` always returns `undefined`; tests take the fallback 404 path and never reach the intended 403 RBAC assertion | `tests/leave-rbac.spec.ts:203,259` |
| SCAN-TEST-04 | 🟠 HIGH | A11y tests must assert `toHaveLength(0)` on violations, not `toBeDefined()` | `expect(results.violations).toBeDefined()` trivially passes on any array including one full of CRITICAL violations; deferred comment cited v1.12 which has long since shipped | `tests/__a11y__/dashboard.a11y.spec.ts` and 5 other a11y spec files |
| SCAN-TEST-05 | 🟠 HIGH | Visual snapshot baselines must be generated in Docker (`-linux` suffix), not macOS (`-darwin` suffix) | All 6 committed baselines have `-darwin` suffix; no `-linux` baselines exist; visual tests cannot pass in CI or Docker | All files under `tests/__visual__/*-snapshots/` |
| SCAN-TEST-06 | 🟠 HIGH | 12 tests across time-entry, validation, and regression specs must replace `expect(true).toBeTruthy()` with real functional assertions | No-op assertions guarantee green regardless of feature state; critical paths (future-date blocking, negative-hours, client creation, navigation) have zero regression protection | `tests/time-entry.spec.ts`, `tests/validation.spec.ts`, `tests/regression.spec.ts` |
| SCAN-TEST-07 | 🟠 HIGH | `cross-assignment-rbac.spec.ts` afterAll must use an authenticated admin context to delete created entries | `pwRequest.newContext()` called with no `storageState`; DELETE requests return 401 and entries accumulate permanently | `tests/cross-assignment-rbac.spec.ts:53-67` |
| SCAN-TEST-08 | 🟠 HIGH | `mobile-timesheet.spec.ts` save-entry test must clean up created rows and must fail hard when save does not occur | No cleanup; comment on line 173 silently passes the test when save fails | `tests/mobile-timesheet.spec.ts:112-174` |
| SCAN-TEST-09 | 🟠 HIGH | `mobile-team-clients-settings.spec.ts` save-new-client test must clean up created rows | No cleanup; orphan `MobileE2E-{timestamp}` clients accumulate in production schema | `tests/mobile-team-clients-settings.spec.ts:175-222` |
| SCAN-TEST-10 | 🟠 HIGH | `@regression` suite must run in CI (Cloud Build) in addition to `@smoke` | Step 9 runs only `--grep @smoke`; regression tests covering audit, rate-limit, RBAC negative paths never execute in CI | `cloudbuild.yaml:170` |
| SCAN-TEST-11 | MEDIUM | `rbac-v11111.spec.ts` TS-P02 and TS-B02 tests must capture created entry IDs and delete them in afterAll | No afterAll or cleanup; `is_test=true` entries accumulate | `tests/rbac-v11111.spec.ts:119,199` |
| SCAN-TEST-12 | MEDIUM | `permissions-review.spec.ts` TS-D05 must clean up created test projects | POST creates a project with `isTest: true` but no DELETE issued; orphan projects accumulate | `tests/permissions-review.spec.ts:287` |
| SCAN-TEST-13 | MEDIUM | `rbac.spec.ts` ADMIN cost_rate PUT test must assert 200, not accept 500 as valid | `expect([200, 500]).toContain(patch.status())` silently passes on server error | `tests/rbac.spec.ts:277` |
| SCAN-TEST-14 | MEDIUM | `module-create-regression.spec.ts` must capture and clean up all 25 created module IDs in afterAll | No cleanup; `TD048Reg*` modules accumulate on every CI run | `tests/module-create-regression.spec.ts:44` |
| SCAN-TEST-15 | MEDIUM | 6 tests in admin/member/manager specs must replace `expect(true).toBeTruthy()` with functional assertions | Project creation, date validation, designation/activity creation tests are guaranteed-green regardless of feature state | `tests/admin.spec.ts`, `tests/member.spec.ts`, `tests/manager.spec.ts` |
| SCAN-TEST-16 | MEDIUM | `dashboard.visual.spec.ts` mask must use `[data-testid="kpi-value"]` (or add that attribute to Dashboard.tsx) not `.kpi-value` (CSS class that does not exist) | Mask matches nothing; KPI numbers are unmasked and cause snapshot failures on any data change | `tests/__visual__/dashboard.visual.spec.ts:24`, `components/Dashboard.tsx` |
| SCAN-TEST-17 | MEDIUM | `leave-calendar.visual.spec.ts` mask must include `thead th` and the month-label span to prevent daily/monthly false failures | Today's column highlight and month label change every day/month; baseline must be regenerated constantly | `tests/__visual__/leave-calendar.visual.spec.ts:50-55` |
| SCAN-TEST-18 | MEDIUM | `mobile-projects.spec.ts` `mobileNav` helper must guard `navBtn.click()` with `isVisible` check (same pattern as all other mobile helpers) | Unconditional click throws `ElementNotVisibleError` on slow CI, failing all 5 tests with navigation error instead of feature error | `tests/mobile-projects.spec.ts:14-30` |
| SCAN-TEST-19 | MEDIUM | 5 `test.fixme` tests must be resolved - TIME-CRUD (full CRUD cycle) and VALID-MOD-B are highest priority | Deferred since "v1.10 stabilization pass" at v1.09; current version is v1.21; VALID-MOD-B fix shipped at v1.10 but test never un-fixme'd | `tests/regression.spec.ts:112`, `tests/time-entry.spec.ts:206`, `tests/validation.spec.ts` |
| SCAN-TEST-20 | MEDIUM | Overtime dedup must use DB-backed storage instead of in-memory Map (resets on container restart / breaks under multi-instance) | `overtimeEmailsSent: Map<string, boolean>` at `index.ts:538`; Cloud Run scales to zero frequently, resetting dedup; duplicate alerts sent after restart | `server/src/index.ts:538` |

## Scan Findings - Confirmed Gaps (2026-08-13 Deep Scan)

Second full deep scan (10 feature-domain slices + architecture/API/testing/tooling/docs slices, 955 files). Findings below are newly confirmed since the 2026-06-04 scan, or are prior findings whose current-state severity changed. Items marked EXTREME or CRITICAL are the highest-priority gaps in the register today.

### Security and Authorization

| ID | Severity | Requirement (as-should-be) | Current State | File(s) |
|----|----------|---------------------------|---------------|---------|
| SCAN2-SEC-01 | 🔴 EXTREME | `GET /api/auth/debug` must require authentication and strip sensitive columns; no public UI should render its raw response | Route has no auth middleware and no rate limiting; returns the raw Passport-deserialized `tb_users` row (`password_hash`, `reset_token`, `reset_token_expires`, rate columns) as JSON. `components/Login.tsx`'s public "Troubleshoot Auth" button (visible on the unauthenticated login screen) calls this endpoint with `credentials: 'include'` and renders the full response in a `<pre>` block. Confirms and escalates SCAN-SEC-01 above. | `server/src/index.ts:342-345`, `components/Login.tsx:54-62,586-597` |
| SCAN2-SEC-02 | 🔴 EXTREME | Legacy `DELETE /api/test-cleanup` must not exist as a second, weaker-safeguard bulk-delete path, and must never delete `tb_audit_log` rows | A second, undocumented (zero callers in this repo), untested bulk-delete endpoint remains mounted alongside the newer `/api/admin/delete-test-data`. It uses a static header instead of per-request test-mode confirmation, runs each DELETE outside a transaction (partial-delete risk on mid-flight failure), omits `tb_firms` from its table list, and unconditionally runs `DELETE FROM tb_audit_log WHERE is_test_mode = true` - directly contradicting the newer endpoint's explicit "audit log is sacrosanct, never bulk-deleted" design | `server/src/index.ts` (legacy route ~3996; new route ~4527) |
| SCAN2-AUTHZ-01 | 🔴 EXTREME (billing) | Invoice Sheet and Dashboard KPI aggregation must exclude tasks with `billable = false` | Neither the invoice-sheet SQL nor Dashboard's cost/hours reducers filter by the per-task `billable` flag; non-billable work is silently counted into invoiced totals and dashboard KPIs. Same as SCAN-DATA-11 above (added there too). | `server/src/index.ts:3830-3856`, `components/Dashboard.tsx:41-65` |
| SCAN2-AUTHZ-02 | 🟠 HIGH | `DELETE /api/time-entries/:id` must scope MANAGER the same way `GET /api/time-entries` does (own entries OR entries for assigned projects) | Handler only special-cases MEMBER (`user_id` match); a MANAGER falls through with **zero** ownership/scope check and can delete any time entry in the system, including entries on projects/clients entirely outside their assignment | `server/src/index.ts:1711-1750` (contrast with the correctly-scoped GET at `index.ts:1145-1154`) |
| SCAN2-AUTHZ-03 | 🟠 HIGH | Google OAuth auto-promotion to ADMIN must be restricted to true first-run bootstrap, not any login where exactly one `auth_id`-linked account exists | Re-runs on every non-ADMIN Google login whenever `SELECT count(*) FROM tb_users WHERE auth_id IS NOT NULL` equals 1 - e.g. if the sole admin is later deleted/downgraded, the next Google login silently becomes ADMIN. Narrow TOCTOU race also possible on true bootstrap (two concurrent first logins both read count=0). | `server/src/index.ts:237-239,257-264` |
| SCAN2-AUTHZ-04 | 🟠 HIGH | MANAGER-visible UI must match MANAGER-permitted server actions on the Team screen | Layout/App.tsx let MANAGER open Team and see a fully working "Add Member"/edit-row UI, but `POST /api/users` and `PUT /api/users/:id` are ADMIN-only server-side; MANAGER gets a generic failure toast with no explanation on every attempt. Product/RBAC-policy decision needed (hide UI for MANAGER vs. relax server gates) - not auto-fixed. | `components/Team.tsx:550-556,595`, `components/Layout.tsx:98,106`, `server/src/index.ts:1828,1953-1961` |
| SCAN2-SEC-03 | MEDIUM | CSV export of invoice data must neutralize formula-injection characters (`=`,`+`,`-`,`@`) in free-text fields | `InvoiceSheet.tsx`'s `exportCsv`/`esc()` only escapes double-quotes; a client/project/company/person/designation name starting with `=` (e.g. `=HYPERLINK(...)`) is written verbatim, enabling CSV/formula injection when opened in Excel/Sheets | `components/InvoiceSheet.tsx:147-165` |
| SCAN2-SEC-04 | MEDIUM | `server/README.md`'s example `.env` block must use obviously-fake placeholder credentials | Example block contains a Google OAuth client ID/secret and a Gemini API key with the exact real-world shape of live credentials (`GOCSPX-...`, `AIzaSy...`), not placeholder text | `server/README.md:14-19` |

### CLI Regressions (server contract changed underneath the CLI since v1.11.10)

| ID | Severity | Requirement (as-should-be) | Current State | File(s) |
|----|----------|---------------------------|---------------|---------|
| SCAN2-CLI-01 | 🔴 CRITICAL | `tt login` must complete server-side 2FA | See SCAN-CLI-03 above. Every real `tt login` fails. |  |
| SCAN2-CLI-02 | 🔴 CRITICAL | `tt log --module`/`--sprint` must not crash | See SCAN-CLI-04 above. Unhandled `TypeError` on the real server's wrapped response shape. |  |
| SCAN2-CLI-03 | 🔴 CRITICAL | `tt log` must send `activityType` | See SCAN-CLI-05 above. Every real `tt log` is rejected 400. |  |
| SCAN2-CLI-04 | 🟠 HIGH | `tt last` must read the real per-task description field | See SCAN-CLI-06 above. Always prints a blank description. |  |

**Net effect: the CLI product (`@tekyz/timetracking-cli`) is non-functional against the real production server today** - login, log, and the module/sprint resolvers all fail or misbehave. `cli/tests/fixtures/mock-server.ts` models a stale pre-2FA, pre-multi-task-entry contract, so `npm run test` in `cli/` is green while the shipped binary cannot complete its two headline commands. See REQ-V11110-1/3/4 traceability rows above (marked REGRESSED).

### Test Integrity (tests that structurally cannot fail)

| ID | Severity | Requirement (as-should-be) | Current State | File(s) |
|----|----------|---------------------------|---------------|---------|
| SCAN2-TEST-01 | 🟠 HIGH | a11y specs must assert `toHaveLength(0)` on serious/critical violations | Still `expect(results.violations).toBeDefined()` (always true) in `timesheet.a11y.spec.ts`, `projects.a11y.spec.ts`, `leave-calendar.a11y.spec.ts` - reconfirms SCAN-TEST-04 as still open at 2026-08-13 | `tests/__a11y__/*.a11y.spec.ts` |
| SCAN2-TEST-02 | 🟠 HIGH | `tests/audit.spec.ts` must query `tb_audit_log` and assert on the real row, not a placebo | All 6 tests are titled/tagged as audit-logging tests; 4 of 6 end on bare `expect(true).toBeTruthy()` with the real SQL check left as a comment for a human to run manually. Would pass identically if audit logging were fully disabled. | `tests/audit.spec.ts` |
| SCAN2-TEST-03 | HIGH | `time-entry.spec.ts`/`mobile-timesheet.spec.ts` must target CreatableSelect's real DOM, not a native `<select>`/radio group that no longer exists | MEMBER-003/003a use `.selectOption()` and `getByRole('radio', {name:'Dev'/'Proposal'})` against a component with zero native select/radio markup; times out or silently never fills Activity Type, and the mobile save-entry test's tautological assertion (`newRows>=initialRows \|\| entryVisible`) passes even when nothing saved | `tests/time-entry.spec.ts`, `tests/mobile-timesheet.spec.ts` |
| SCAN2-TEST-04 | MEDIUM | `rbac.spec.ts`'s privilege-escalation test must re-fetch and confirm the blocked row was NOT inserted, not just check the HTTP status | `expect(res.status()).toBe(403)` only; never re-GETs as ADMIN to confirm "Hacker Admin" wasn't created, despite the same file using that stronger pattern elsewhere | `tests/rbac.spec.ts:36-41` |
| SCAN2-TEST-05 | MEDIUM | TS-P01 rate-hiding RBAC assertions must check every returned user row, not just `users[0]` | `rbac-v11111.spec.ts` only inspects the first row; a per-row leak on a later row would pass undetected. Sibling `rbac.spec.ts` already uses the correct `for (const u of users)` loop. | `tests/rbac-v11111.spec.ts:31-43,49-59` |
| SCAN2-TEST-06 | MEDIUM | `admin.spec.ts` Settings-management tests (add designation, add activity type) must assert the new chip renders via its `data-testid`, not `expect(true).toBeTruthy()` | 6 of 16 tests in the file, including both Settings tests owned by this area, end unconditionally true regardless of whether the add succeeded | `tests/admin.spec.ts:468-499,501-531` |
| SCAN2-TEST-07 | LOW | Committed visual-snapshot baselines must be `-linux` (Docker-generated), matching documented IMP-003 policy | `timesheet-member-visual-darwin.png` (and the other 5 visual specs' baselines project-wide) remain macOS-generated; CI/Docker cannot find a matching baseline | `tests/__visual__/*-snapshots/*-darwin.png` |

### Accessibility

| ID | Severity | Requirement (as-should-be) | Current State | File(s) |
|----|----------|---------------------------|---------------|---------|
| SCAN2-A11Y-01 | MEDIUM | Timesheet column sort headers (`<th>`) must be keyboard-activatable (Enter/Space) | `onClick` only, no `tabIndex`, `role="button"`, or `onKeyDown`; keyboard-only users cannot sort the grid by any column | `components/SortableHeader.tsx:44-50` |
| SCAN2-A11Y-02 | MEDIUM | Leave calendar day cells must be keyboard-activatable to open the leave editor | `<td onClick>` with no `tabIndex`/`role`/`onKeyDown`; the entire create/edit/delete-leave flow is mouse-only | `components/LeaveCalendar.tsx:377-390` |
| SCAN2-A11Y-03 | MEDIUM | `RightPanel` (shared base for every slide-in edit panel) and its `DirtyConfirmModal` must carry `role="dialog"`/`aria-modal="true"` | Plain `<div>`s with no dialog semantics or focus management, unlike `CrossAssignmentWarnDialog` which already sets both correctly | `components/RightPanel.tsx:131-154,158-190` |
| SCAN2-A11Y-04 | MEDIUM | `DeleteTestDataModal`/`ConfirmModal` must carry dialog semantics and Escape-to-close; `settings.a11y.spec.ts` must actually open and scan them | Neither modal sets `role="dialog"`/`aria-modal`/Escape handling; the a11y spec never opens either modal, so axe never scans the highest-stakes destructive-action UI in Settings | `components/DeleteTestDataModal.tsx`, `components/ConfirmModal.tsx`, `tests/__a11y__/settings.a11y.spec.ts` |

### Documentation Drift (post-migration)

Cloud Run + Supabase were decommissioned 2026-08-03 in favor of Vercel + Neon (recorded in `docs/infrastructure.md`'s Environments registry, commit c159bc4). The following documents still describe the decommissioned stack as current and were not updated in the same pass:

| ID | Severity | File(s) | Gap |
|----|----------|---------|-----|
| SCAN2-DOC-01 | HIGH | `docs/architecture.md`, `README.md`, `CLAUDE.md:102` | Stack/Hosting tables say Google Cloud Run + Supabase; actual prod is Vercel + Neon per `docs/infrastructure.md`'s own Environments table |
| SCAN2-DOC-02 | HIGH | `cloudbuild.yaml`, `Dockerfile`, `nginx.conf`, `.gcloudignore`, `package.json:9` (`npm run deploy`) | Full Cloud Run deploy pipeline remains at repo root, wired to deleted Secret Manager entries and a decommissioned Cloud Run project; `npm run deploy` still invokes it |
| SCAN2-DOC-03 | MEDIUM | `IndependentReview/architecture-review.md`, `IndependentReview/ux-review.md` | Written entirely against the pre-migration Cloud Run/Supabase/nginx architecture with no revision date or superseded-findings note |
| SCAN2-DOC-04 | MEDIUM | `businessRules.md`, `BUSINESS_RULES_SUMMARY.md` | Describe RBAC as fully enforced (MANAGER/MEMBER "cannot access" Team/Clients/Settings), contradicting this file's own F6 status ("documented but not enforced," TD-001) |
| SCAN2-DOC-05 | MEDIUM | `.gsd-t/progress.md` top banner | Version/Status/Date banner stale by ~10 days vs. the file's own Decision Log (multi-task time entry + production migration both post-date the banner) |
| SCAN2-DOC-06 | MEDIUM | `.gsd/prompt-history.md` | Mandated prompt log (CLAUDE.md Prime Directive #4) stops 2026-07-05; 5+ weeks of subsequent work (v1.22, the Vercel/Neon migration, migrations 16/17) unlogged |

### Data Quality / Correctness (LOW-MEDIUM, non-blocking)

| ID | Severity | Requirement (as-should-be) | Current State | File(s) |
|----|----------|---------------------------|---------------|---------|
| SCAN2-DQ-01 | MEDIUM | Client Name field in the Edit Client panel must be a controlled input (`value=`) | Uses `defaultValue={value}` on an input that is never remounted between opens (RightPanel only toggles CSS classes); the box can visually show a previously-edited client's name after switching clients, risking a save that silently overwrites the wrong client's name | `components/Clients.tsx:25-42` (reconfirms SCAN-FE-03 as still open) |
| SCAN2-DQ-02 | LOW | Task `module` value must be trimmed before save, matching `taskDescription` | `tasksForPayload()` trims `taskDescription` but sends `module` raw; a trailing-space variant silently fragments the module picker/filter | `components/TimeEntryPanel.tsx` |
| SCAN2-DQ-03 | LOW | Projects grid "Client" column sort must sort by the displayed client name, not the raw `clientId` | `useGridSort` sorts directly on `project.clientId` (an opaque id string); clicking "Client" produces an order with no relation to the alphabetized names shown on screen | `components/Projects.tsx:177,248-250`, `hooks/useGridSort.ts:70-76` |
| SCAN2-DQ-04 | LOW | "Max Hours Per Day" input in Settings must be wired to state and `handleSaveConfig()`, or clearly marked non-functional | `defaultValue={12}` with no `value`/`onChange`/inclusion in the save payload; changes are silently discarded with no error shown | `components/Settings.tsx:322` |
| SCAN2-DQ-05 | LOW | Future-date guard must apply to the visible text-entry path of the date field, not only the hidden native `<input type=date>` | `commit()` in `FloatingLabelDate` never compares the typed/pasted value against `max`; a future date typed directly commits client-side and is only caught by the server round-trip | `components/TimeEntryPanel.tsx` |

## Source Documents

- `REQUIREMENTS.md` (project root) - full functional spec, ~1500 lines
- `BUSINESS_RULES_SUMMARY.md` - business rules catalog
- `businessRules.md` - rule narrative
- `.gsd-t/scan/business-rules.md` - code-level enforcement audit (2026-06-04 scan)
- `.gsd-t/scan/architecture.md` - full architecture analysis
- `.gsd-t/techdebt.md` - actionable register
- 2026-08-13 deep scan (10 feature-domain slices, 955 files, 68 routes) - findings folded directly into this file's "Scan Findings - Confirmed Gaps (2026-08-13 Deep Scan)" section above; no separate scan-output file for this pass

## Requirements Traceability — v1.08 Security Hardening

The traceability table maps in-scope tech-debt items (the working "REQ-IDs" of this milestone) to their owning domain and tasks.

| TD-ID | Requirement Summary | Domain | Task(s) | Status |
|-------|---------------------|--------|---------|--------|
| TD-001 | Server-side RBAC unenforced | server-rbac | T1–T8 (entire domain) | pending |
| TD-002 | Missing authz on POST /api/users | server-rbac | T3 | pending |
| TD-003 | Missing authz on POST /api/clients, /api/projects, /api/meta | server-rbac | T3, T4 | pending |
| TD-004 | Hardcoded test creds in migration | server-auth-hardening | T5 | pending |
| TD-005 | No login / password-reset rate limiting | server-auth-hardening | T2, T3, T8 | pending |
| TD-006 | CORS allows attacker-controlled origins | secrets-and-deps | T4 | pending |
| TD-007 | Weak default cookie signing key | server-auth-hardening | T4, T8 | pending |
| TD-008 | Secrets committed to repo (server/app.yaml) | secrets-and-deps | T5, T6, T7 | resolved 2026-05-12 (file removed entirely with Cloud Run migration; HUMAN secret-rotation gate still applies — see infrastructure.md "Secret Rotation Log") |
| TD-009 | Vulnerable nodemailer 6.9.9 | secrets-and-deps | T2, T3, T8 | pending |
| TD-010 | Missing authz on PUT/DELETE for users/clients/projects/meta | server-rbac | T3, T4 | pending |
| TD-011 | Sensitive debug logging leaks config | server-auth-hardening | T6 | pending |
| TD-014 | Email recipient header validation missing | server-auth-hardening | T7 | pending |
| TD-001-FE | Frontend follow-on (response shape + 403 toast) | frontend-permissions | T2–T6 | pending (gated on CP-1) |

Orphaned in-scope items: none.
Unanchored tasks (work not tied to a TD): none.

## Requirements Traceability — v1.10 UX & Permissions Polish (COMPLETE — 2026-05-14)

Captured 2026-05-13 from Zoom app-review session. Planning doc: `.planning/milestones/v1.10-MILESTONE.md`. Partitioned 2026-05-13 15:29; planned 2026-05-13 15:39. 4 domains, 44 tasks total. **All 12 in-scope requirements verified and shipped 2026-05-14 (155/163 Playwright tests pass; 7 pre-existing flakes documented in test-sync log are NOT v1.10 regressions).**

| REQ-ID | Requirement Summary | Area | Domain | Task(s) | Status |
|--------|---------------------|------|--------|---------|--------|
| V110-R01 | Right-panel backdrop too opaque — reduce dim so main page stays readable | UX | client-ux-polish | T1, T4 | **complete 2026-05-14** (verified by `ui-polish.spec.ts` 4 tests) |
| V110-R02 | Hide "AI improvement" heading from slide-out panels until feature ships | UX | client-ux-polish | T2, T4 | **complete 2026-05-14** (verified by `ui-polish.spec.ts` 1 test) |
| V110-R03 | Super Admin auto-access to all projects in Add Time Entry picker | RBAC | permissions-scoping | T1, T6 | **complete 2026-05-14** (verified by `rbac.spec.ts` 3 tests) |
| V110-R04 | Hourly cost field visible/editable to Super Admin only | RBAC | permissions-scoping | T2, T3, T4, T5, T6 | **complete 2026-05-14** (verified by `rbac.spec.ts` 6 tests) |
| V110-R05 | Remove "Super Admin" from Designations list on Add Team Member | Team | team-member-and-designations | T1, T5, T10, T14 | **complete 2026-05-14** (verified by `team.spec.ts` 2 tests) |
| V110-R06 | Super Admin can add new designation on the fly from Add Team Member | Team | team-member-and-designations | T5, T5b, T8, T11, T14 | **complete 2026-05-14** (verified by `team.spec.ts` 4 tests) |
| V110-R07 | Team member supports multiple designations (M:N) | Team | team-member-and-designations | T2, T6, T8, T9, T10, T13, T14 | **complete 2026-05-14** (verified by `team.spec.ts` 5 tests incl. FE) |
| V110-R08 | Hourly Cost field on team member (separate from hourly rate) | Team | team-member-and-designations | T3, T7, T9, T12, T13, T14 | **complete 2026-05-14** (verified by `team.spec.ts` 2 tests) |
| ~~V110-R09~~ | ~~Hourly rate tied to designation~~ | Team | — | — | **DEFERRED 2026-05-13** — out of v1.10 scope |
| V110-R10 | Remove Logo field from Add New Client panel | Clients | client-ux-polish | T3, T4 | **complete 2026-05-14** (verified by `ui-polish.spec.ts` 1 test) |
| V110-R11 | Sprint "Done" checkbox on project panel — Done sprints hidden from time-entry picker | Projects | project-and-sprint-extensions | T1, T5, T6, T11, T12, T15, T19 | **complete 2026-05-14** (verified by `projects.spec.ts` 4 tests incl. FE) |
| V110-R12 | Module field on project = type-ahead from existing modules | Projects | project-and-sprint-extensions | T2, T5, T7, T11, T13, T18, T19 | **complete 2026-05-14** (verified by `projects.spec.ts` 5 tests incl. FE) |
| V110-R13 | Team assignment: inline new designation + multiple designations per person per project | Projects | project-and-sprint-extensions | T3, T4, T5, T8, T9, T10, T11, T14, T16, T17, T18, T19 | **complete 2026-05-14** (verified by `projects.spec.ts` 6 tests incl. FE) |

Orphaned requirements (no task): none.
Unanchored tasks (work not tied to a REQ): none. All 44 tasks across 4 domains anchor to one of the 12 in-scope V110 requirements.

Out of scope (staged for brainstorming): **BL-001** Jira/ClickUp/Haiku PM-tool integration — see `.gsd-t/backlog.md`.

## Requirements Traceability — v1.10.12 Right-Panel UX + Grid Audit Columns + Module Tag Fix (COMPLETE — 2026-05-14)

Planning doc: `.gsd-t/progress.md` v1.10.12 milestone. 4 domains, patch release (1.10.11 → 1.10.12). Tagged v1.10.12.

| REQ-ID | Description | Domain | Tests | Status |
|--------|-------------|--------|-------|--------|
| REQ-V1012-1 | Shared `RightPanel` component wraps all slide-out panels; dirty-form confirm modal on close; `onSave: () => Promise<boolean>` validates before closing | right-panel-component | `tests/__components__/RightPanel.test.tsx` (8 @regression) | **complete 2026-05-14** |
| REQ-V1012-2 | All 5 close triggers (backdrop, X, Esc, row click, popstate) route through dirty check | right-panel-component | `tests/__components__/RightPanel.test.tsx` | **complete 2026-05-14** |
| REQ-V1012-3 | Audit columns (`created`, `created_by`, `updated`, `updated_by`) on `tb_users`, `tb_clients`, `tb_projects`; backfilled for existing rows | audit-columns-schema | `tests/module-tag.spec.ts` (smoke, backfill verified) | **complete 2026-05-14** |
| REQ-V1012-4 | Grid sort: default `updated DESC`; sortable headers with ▲/▼ indicator; hidden audit columns toggle (Eye/EyeOff); applied to all 5 grids | grid-sort-and-hidden-columns | `tests/__components__/RightPanel.test.tsx` (infrastructure), manual | **complete 2026-05-14** |
| REQ-V1012-5 | Module 409 protection: `DELETE /api/modules/:id` returns 409 when in-use; FE disables (not hides) delete button with tooltip | module-tag-fix | `tests/module-tag.spec.ts` (3 @rbac + 2 @regression @smoke) | **complete 2026-05-14** |

## Requirements Traceability — v1.09 Comprehensive Testing (COMPLETE — 2026-05-14)

Planning doc: `.planning/milestones/v1.09-MILESTONE.md`. Planned 2026-05-14. 4 domains, 45 tasks total. Success criteria treated as REQ-V109-1 through REQ-V109-10. Tagged v1.10.11.

| REQ-ID | Success Criterion | Domain(s) | Task(s) | Status |
|--------|-------------------|-----------|---------|--------|
| REQ-V109-1 | Layout-only ratio drops below 20% across the 8 owned legacy specs (currently ~94% layout outside rbac.spec.ts) | e2e-functional-coverage | T1–T8 (every spec refactored) | **complete 2026-05-14** — verifying: tests/admin.spec.ts, tests/audit.spec.ts, tests/auth.spec.ts, tests/manager.spec.ts, tests/member.spec.ts, tests/regression.spec.ts, tests/time-entry.spec.ts, tests/validation.spec.ts |
| REQ-V109-2 | All previously-untagged tests carry an explicit tag (`@smoke`, `@regression`, `@full`, `@rbac`, `@a11y`, `@manual`); target: 0 untagged | e2e-functional-coverage (T1–T8 + T14), mobile-e2e-coverage (T1 tag-hygiene script, T12 final validation), visual-a11y (T2–T11 all tagged), component-tests (unit lane — exempt from Playwright tags) | e2e: T1–T8, T14; mobile: T1, T12; visual: T2–T11 | **complete 2026-05-14** — verifying: scripts/check-test-tags.cjs (213 tests / 28 files / 0 violations) |
| REQ-V109-3 | 6 missing smoke flows added (password reset E2E, new-user setup E2E, module-required-unless-Proposal 4 permutations, overtime detection, MANAGER write-scope 403, anonymous landing regression guard) | e2e-functional-coverage | T4 (anonymous landing), T9 (password reset), T10 (new-user setup), T11 (module-required), T12 (overtime), T13 (MANAGER write-scope) | **complete 2026-05-14** — verifying: tests/auth.spec.ts (AUTH-RESET-001, AUTH-NEWUSER-001, MANAGER-SCOPE-403-*, OVERTIME-001/002), tests/regression.spec.ts (ANON-001, DASH-001), tests/admin.spec.ts (module-required permutations) |
| REQ-V109-4 | Full mobile-phone E2E coverage (iPhone 13 viewport) — every screen, every interactive element, every modal/panel/popup; ~30-40 tests all `@smoke` | mobile-e2e-coverage | T3 (chrome-mobile project), T4 (mobile-auth), T5 (mobile-layout), T6 (mobile-timesheet), T7 (mobile-dashboard), T8 (mobile-projects), T9 (mobile-team-clients-settings), T10 (verification) | **complete 2026-05-14** — verifying: tests/mobile-auth.spec.ts, tests/mobile-layout.spec.ts, tests/mobile-timesheet.spec.ts, tests/mobile-dashboard.spec.ts, tests/mobile-projects.spec.ts, tests/mobile-team-clients-settings.spec.ts (38 @smoke tests) |
| REQ-V109-5 | A11y baseline: `@axe-core/playwright` integrated; Login, Dashboard, TimeSheet, Projects, Settings each assert zero serious/critical axe violations | visual-a11y | T1 (install + a11y project), T2 (login a11y), T3 (dashboard a11y), T4 (timesheet a11y), T5 (projects a11y), T6 (settings a11y) | **complete 2026-05-14** — verifying: tests/__a11y__/login.a11y.spec.ts, dashboard.a11y.spec.ts, timesheet.a11y.spec.ts, projects.a11y.spec.ts, settings.a11y.spec.ts (filed-not-fixed pattern: TD-046 documents existing violations) |
| REQ-V109-6 | Visual regression baseline: 5 snapshots committed (Login, Dashboard, TimeSheet, Project detail, Settings); diff threshold 0.2% | visual-a11y | T1 (visual project config), T7 (login snapshot), T8 (dashboard snapshot), T9 (timesheet snapshot), T10 (projects snapshot), T11 (settings snapshot + final verification CP-V109-3) | **complete 2026-05-14** (partial — macOS baselines committed; Docker baselines deferred to v1.10.11 T11, pre-approved 2026-05-14) — verifying: tests/__visual__/login.visual.spec.ts, dashboard.visual.spec.ts, timesheet.visual.spec.ts, projects.visual.spec.ts, settings.visual.spec.ts |
| REQ-V109-7 | Component tests bootstrapped: Vitest + `@testing-library/react` installed; 5 priority components tested (Login, ConfirmModal, TimeEntryPanel validation, ProjectPanel module list, Dashboard KPI); TD-018 closed | component-tests | T1 (Vitest config CP-V109-2), T2 (Login), T3 (ConfirmModal), T4 (TimeEntryPanel), T5 (ProjectPanel), T6 (Dashboard), T7 (tsc + TD-018 closure) | **complete 2026-05-14** — verifying: tests/__components__/Login.test.tsx, ConfirmModal.test.tsx, TimeEntryPanel.test.tsx, ProjectPanel.test.tsx, Dashboard.test.tsx (31 unit tests pass) |
| REQ-V109-8 | All 8 skipped/flaky tests triaged: fixed, deleted, or filed as backlog with `test.fixme()` | e2e-functional-coverage | T14 (triage all 8 flakes across manager/time-entry/validation/auth specs) | **complete 2026-05-14** — verifying: tests/regression.spec.ts (TIME-CRUD test.fixme), tests/time-entry.spec.ts (REQ-TIME-FILTER-002 test.fixme), tests/validation.spec.ts (VALID-016a/VALID-016 test.fixme); MANAGER-011 + MEMBER-003 fixed |
| REQ-V109-9 | CI green: Cloud Build smoke suite passes all `@smoke` tests; total smoke count rises from 24 → ~40+; total suite runs under 10 min wall-clock | mobile-e2e-coverage (T11 cloudbuild.yaml), e2e-functional-coverage (new @smoke flows T4/T9/T10/T12/T13), mobile-e2e-coverage (T10 runtime check) | mobile: T10, T11; e2e: T4, T9, T10, T12, T13 | **complete 2026-05-14** — verifying: cloudbuild.yaml step 8 (check-test-tags.cjs gate); 109 @smoke tests total (up from 24); mobile suite 37/37 in 58.8s |
| REQ-V109-10 | TD-045 closed: `server/src/middleware/rate-limit.ts` login limiter exempts Playwright UA on non-production hosts (Cloud Run prod + custom domain unaffected); functional `@regression` test verifies the production-path 429 still fires | e2e-functional-coverage | T15 | **complete 2026-05-14** — verifying: server/src/middleware/rate-limit.ts isPlaywrightTest() guard; tests/auth.spec.ts RATELIMIT-001/002 (@regression); TD-045 status CLOSED |

Orphaned requirements (no task): none — all 10 success criteria map to ≥1 task.
Unanchored tasks (work not tied to a REQ): none — all 45 tasks (e2e: 15, component: 7, visual: 11, mobile: 12) anchor to one or more REQ-V109-* criteria.

## Requirements Traceability — v1.11.10 Developer CLI (COMPLETE — 2026-05-14)

Planning doc: `.planning/milestones/v1.11.10-MILESTONE.md`. 4 domains, 1 wave. New npm package `@tekyz/timetracking-cli`. Tagged v1.11.10.

| REQ-ID | Description | Domain | Tests | Status |
|--------|-------------|--------|-------|--------|
| REQ-V11110-1 | `tt login` authenticates via `/auth/login`, stores cookie at `~/.tekyz/cli/session.json` (mode 0600); `--server` flag overrides default URL | cli-auth | `cli/tests/login.test.ts` (@smoke @regression) | ⚠️ **REGRESSED (2026-08-13 scan)** — server-side 2FA (shipped after this milestone) means `/auth/login` no longer returns a session cookie; `tt login` cannot complete against the real server. See SCAN-CLI-03. Mock server (`cli/tests/fixtures/mock-server.ts`) still models the pre-2FA contract, so tests pass while the product is broken. |
| REQ-V11110-2 | `tt logout` POSTs `/auth/logout` (best-effort) + deletes local session file; succeeds even if server unreachable | cli-auth | `cli/tests/login.test.ts` (@regression) | **complete 2026-05-14** |
| REQ-V11110-3 | `tt log <hours> <client>/<project> <description>` resolves slug pair via fuzzy match, POSTs time entry; ambiguous slug → exit 1 with list; `--date`, `--module`, `--sprint` flags | cli-commands | `cli/tests/log.test.ts` (@smoke @regression) | ⚠️ **REGRESSED (2026-08-13 scan)** — see SCAN-CLI-03/04/05 below; mock server tests still pass but the real server rejects these calls |
| REQ-V11110-4 | `tt last` fetches most recent time entry and prints one-line summary (date, client/project, hours, description) | cli-commands | `cli/tests/report.test.ts` (@smoke) | ⚠️ **REGRESSED (2026-08-13 scan)** — see SCAN-CLI-06; description always prints blank against the real API |
| REQ-V11110-5 | `tt report` groups entries by project, sums hours, tabular output; `--week` (default), `--month`, `--from`/`--to`, `--json` | cli-commands | `cli/tests/report.test.ts` (@regression) | **complete 2026-05-14** |
| REQ-V11110-6 | `tt projects [--client <name>] [--json]` lists visible projects filtered by RBAC | cli-commands | `cli/tests/log.test.ts` (@regression) | **complete 2026-05-14** |
| REQ-V11110-7 | `tt clients [--json]` lists visible clients filtered by RBAC | cli-commands | `cli/tests/log.test.ts` (@regression) | **complete 2026-05-14** |
| REQ-V11110-8 | `tt --help` and `tt <cmd> --help` print usage; exit 0 | cli-scaffold | `cli/tests/report.test.ts` (@smoke — binary smoke) | **complete 2026-05-14** |
| REQ-V11110-9 | CLI binary builds cleanly: `cd cli && npm run build` exits 0; strict TypeScript; no `any` without comment | cli-scaffold | `npm run build` in cloudbuild.yaml step 8a | **complete 2026-05-14** |
| REQ-V11110-10 | `cli-contract.md` documents command shapes, exit codes, output formats, session file format, API dependencies | cli-tests-and-docs | manual review | **complete 2026-05-14** |
| REQ-V11110-11 | Tag hygiene: all CLI tests tagged `@smoke` or `@regression`; check-test-tags.cjs passes | cli-tests-and-docs | `scripts/check-test-tags.cjs` | **complete 2026-05-14** |
| REQ-V11110-12 | `cloudbuild.yaml` step 8a gates CLI build + tests before E2E; no regressions in existing build pipeline | cli-scaffold | Cloud Build step 8a | **complete 2026-05-14** |

## Requirements Traceability — v1.11.11 Review Bug-Fix + Permissions + Config Bundle (COMPLETE — 2026-05-18)

Source: `timesheet-Zoom Review Claude Comments-2026-05-15.md`. 4 domains, single wave. Bug fixes, permission hardening, config feature additions. Tagged v1.11.11.

| REQ-ID | Description | Domain | Tests | Status |
|--------|-------------|--------|-------|--------|
| REQ-V11111-B01 | Test mode banner is sticky to top of viewport (not scrolling away) — `sticky top-0 z-50` CSS class | bugfix | `tests/permissions-review.spec.ts` TS-B01 (@regression) | **complete 2026-05-18** |
| REQ-V11111-B02 | Test data (`is_test=true`) excluded from API responses by default; `x-test-mode: true` header re-includes them — time entries, designations, modules, sprints, projects | bugfix | `tests/rbac-v11111.spec.ts` TS-B02 (@regression) | **complete 2026-05-18** |
| REQ-V11111-B03 | Designation dropdown: 500 error → graceful duplicate handling (return 200 + existing record); label "Add Designation"; auto-select on duplicate | bugfix | `tests/rbac-v11111.spec.ts` (designation conflict via API @regression) | **complete 2026-05-18** |
| REQ-V11111-B04 | New time entry panel not dirty on open — `initialSnapshot` set when panel opens, auto-select effects update snapshot | bugfix | `tests/permissions-review.spec.ts` TS-B04 (@smoke @regression) | **complete 2026-05-18** |
| REQ-V11111-B05 | Audit toggle label renamed: "Show Hidden" / "Hide Hidden" (was "Show Audit" / "Hide Audit") across Team, Clients, Projects | bugfix | `tests/permissions-review.spec.ts` TS-B05 (@smoke @regression) | **complete 2026-05-18** |
| REQ-V11111-B06 | Audit fields (`created`, `created_by`, `updated`, `updated_by`) returned in GET /api/users, /api/clients, /api/time-entries responses | bugfix | `tests/permissions-review.spec.ts` TS-B06 (@regression) | **complete 2026-05-18** |
| REQ-V11111-B07 | Timesheet search extended to project name, user name, sprint, role fields (was task description + module only) | bugfix | `tests/permissions-review.spec.ts` TS-B07 (@smoke @regression) | **complete 2026-05-18** |
| REQ-V11111-P01 | Rate fields (Hourly Rate, Hourly Cost) hidden from MANAGER and MEMBER in Team member panel UI; API enforces `hourlyRate=0`, no `cost_rate` for non-ADMIN | permissions | `tests/rbac-v11111.spec.ts` TS-P01 (@smoke @rbac @regression) | **complete 2026-05-18** |
| REQ-V11111-P02 | ADMIN can create time entry for any user on any project regardless of project assignment | permissions | `tests/rbac-v11111.spec.ts` TS-P02 (@smoke @rbac) | **complete 2026-05-18** |
| REQ-V11111-C01 | Minimum time increment: functional toggle + free-text input in Settings; persists via `PUT /api/config/min-time-increment` | config | `tests/rbac-v11111.spec.ts` TS-C01 (@smoke @rbac @regression) | **complete 2026-05-18** |
| REQ-V11111-C02 | Mandatory weekly hours: functional toggle + hours input; `tb_weekly_unavailability` table for per-resource override; ADMIN-only API | config | `tests/rbac-v11111.spec.ts` TS-C02 (@rbac @regression) | **complete 2026-05-18** |
| REQ-V11111-D02 | Client rate/cost fields removed from UI (no DB column exists; API already did not expose); no breaking change | decision | manual verification | **complete 2026-05-18** |
| REQ-V11111-D03 | Settings module management (designation, activity type, module) is ADMIN-only via `GET /api/settings/modules` + conditional UI | decision | `tests/rbac-v11111.spec.ts` TS-D03 (@smoke @rbac @regression) | **complete 2026-05-18** |
| REQ-V11111-D05 | Super-admin auto-assign removed from POST/PUT /api/projects | decision | `tests/permissions-review.spec.ts` TS-D05 (@regression) | **complete 2026-05-18** |
| REQ-V11111-I02 | Playwright regression specs created: `tests/rbac-v11111.spec.ts`, `tests/permissions-review.spec.ts`; all tests tagged; tag hygiene passes | testing | `scripts/check-test-tags.cjs` | **complete 2026-05-18** |

## v1.20 — Leave Tracking (COMPLETE 2026-05-19 — tagged v1.20.10)

Source: BL-003 brainstorm (LOCKED, Direction 2) → `.planning/milestones/v1.20-MILESTONE.md`. Contract: `.gsd-t/contracts/leave-contract.md` v1.0.1.

| REQ-ID | Description | Domain | Tests | Status |
|--------|-------------|--------|-------|--------|
| REQ-V120-R01 | `tb_leave` table (migration 12, additive): `user_id` FK ON DELETE RESTRICT, `leave_date DATE` (never timestamptz), `half_day` CHECK FULL/AM/PM, `leave_type` CHECK VACATION/SICK/PARTNER/HOLIDAY, nullable approval cols, audit cols, `UNIQUE(user_id,leave_date,half_day)` | leave-backend | `tests/leave-guard.spec.ts` (bare-DATE round-trip @regression) | **complete** |
| REQ-V120-R02 | `/api/leave` CRUD (GET range, POST, PUT, DELETE) reusing rbac-contract v1.1.0 MANAGER scope predicate exactly; additive endpoints, no §3.5 narrowing; Swagger updated | leave-backend | `tests/leave-rbac.spec.ts` (@smoke @rbac @regression) | **complete** |
| REQ-V120-R03 | Standalone leave calendar page: month grid (people × days), color by `leave_type`, half-day split-cell, computed weekend shading, reuses v1.10.12 RightPanel + grid-sort; own nav entry; NOT inline in timesheet | leave-calendar-ui | `tests/leave-calendar.spec.ts` + mobile + a11y + visual (@smoke @regression @a11y) | **complete** |
| REQ-V120-R04 | Right-panel cell editor: click a day cell → set/edit/delete that person's leave, RBAC-scoped | leave-calendar-ui | `tests/leave-calendar.spec.ts` (@smoke @regression) | **complete** |
| REQ-V120-R05 | Timesheet guard in POST/PUT /api/time-entries after the hours check, mirroring `checkOvertimeAndNotify`: FULL-day leave + any hours → warn; half-day + total >4h → warn; non-blocking (entry still saves) | leave-backend | `tests/leave-guard.spec.ts` (all 3 branches @smoke @regression) | **complete** |
| REQ-V120-R06 | Override path: re-submit with override flag → server re-validates leave exists (force-with-lease) → emits `[NOTIFICATION] LEAVE-CONFLICT` structured log + persists notifier flag; no delivery this milestone | leave-backend | `tests/leave-guard.spec.ts` (override emits + persists @regression) | **complete** |
| REQ-V120-R07 | "Changed prior vacation" highlight: `audit.ts` validTables += `tb_leave`; `logAudit` on every leave CREATE/UPDATE/DELETE; calendar highlights a cell whose row has ≥1 UPDATE audit entry where leave_date/leave_type before≠after | leave-backend + leave-calendar-ui | `tests/leave-calendar.spec.ts` (highlight after edit @regression) | **complete** |
| REQ-V120-R08 | Per-change tests per test-requirements-per-change-contract v1.0.0: RBAC on /api/leave; functional E2E (guard warn + override + entry saves); mobile E2E + a11y + visual for the calendar; all tagged | all three domains | tag hygiene via `scripts/check-test-tags.cjs` | **complete** |
| REQ-V120-UX | Client warn/override dialog on the existing timesheet consuming the §3 `leaveWarning` shape; non-blocking; mirrors the overtime-warning UX; no inline leave rendering | timesheet-guard-ux | `tests/leave-guard-ux.spec.ts` (@smoke @regression) | **complete** |

### v1.20 Requirements Traceability (updated by complete-milestone 2026-05-19)

| REQ-ID | Requirement Summary | Domain | Task(s) | Status |
|--------|---------------------|--------|---------|--------|
| REQ-V120-R01 | `tb_leave` table + unique index (migration 12) | leave-backend | Task 1 | **complete** |
| REQ-V120-R02 | `/api/leave` CRUD w/ rbac scope reuse + Swagger | leave-backend | Task 2, Task 5 | **complete** |
| REQ-V120-R03 | Standalone calendar page (month grid, colors, weekend, reused components) | leave-calendar-ui | Task 2, Task 5 | **complete** |
| REQ-V120-R04 | RightPanel cell editor (set/edit/delete, RBAC-scoped) | leave-calendar-ui | Task 3, Task 5 | **complete** |
| REQ-V120-R05 | Timesheet guard rule (FULL+any / half+>4h → warn, non-blocking) | leave-backend | Task 4 | **complete** |
| REQ-V120-R06 | Override re-validate + `[NOTIFICATION] LEAVE-CONFLICT` emit + notifier flag | leave-backend | Task 4, Task 7 | **complete** |
| REQ-V120-R07 | Changed-vacation audit highlight (`audit.ts` validTables + derived flag + render) | leave-backend, leave-calendar-ui | leave-backend Task 3; leave-calendar-ui Task 5 | **complete** |
| REQ-V120-R08 | Per-change tests (RBAC + functional E2E + mobile + a11y + visual, tagged) | all three | leave-backend Tasks 6-7; leave-calendar-ui Tasks 6-7; timesheet-guard-ux Task 2 | **complete** |
| REQ-V120-UX | Client warn/override dialog on timesheet | timesheet-guard-ux | Task 1, Task 2 | **complete** |

## v1.21 — Permissive Assignment + Cross-Assignment Notification (DEFINED 2026-05-26)

Source: user request 2026-05-26 in-session → `.planning/milestones/v1.21-MILESTONE.md`. Pattern reuse: v1.20 LEAVE-CONFLICT log-line grammar + `tb_leave_conflict_event` audit-marker (`server/src/index.ts:~865`) + v1.20 TimeEntryPanel "Override & notify" dialog UX; v1.11.11 TS-P02 ADMIN-bypass on POST /api/time-entries.

| REQ-ID | Description | Domain | Tests | Status |
|--------|-------------|--------|-------|--------|
| REQ-V121-R01 | Remove "No Projects Assigned" wall in TimeEntryPanel — all roles open the form regardless of `assignedProjectIds`/`assignedClientIds` | assignment-ux | new `tests/cross-assignment.spec.ts` (panel-opens-for-all-roles @smoke) | **complete** |
| REQ-V121-R02 | Client-select warn dialog: unassigned client → "You are not assigned to {Client}. Continue?" (Cancel + Continue), fires on selection | assignment-ux | `tests/cross-assignment.spec.ts` (client warn @smoke @regression) | **complete** |
| REQ-V121-R03 | Project-select warn dialog: unassigned project → identical pattern to R02 | assignment-ux | `tests/cross-assignment.spec.ts` (project warn @smoke @regression) | **complete** |
| REQ-V121-R04 | Override flag plumbing: `crossAssignmentOverride: boolean` on POST/PUT /api/time-entries; server bypasses scope check when set; defense-in-depth scope check still runs when flag absent | assignment-backend + assignment-ux | `tests/cross-assignment-rbac.spec.ts` (override accepted; without flag → 403/400 @rbac @smoke) | **complete** |
| REQ-V121-R05 | Audience computation server-side: (PMs by project) ∪ (PMs by client) ∪ (all ADMINs), deduplicated by `user.id` | assignment-backend | `tests/cross-assignment.spec.ts` (audience-correctness via audit-row recipients[] @regression) | **complete** |
| REQ-V121-R06 | Email channel: reuse `server/src/email.ts` nodemailer; best-effort (failure logged, does not roll back save); one email per unique recipient | assignment-backend | `tests/__components__/cross-assignment-email.test.ts` (sendMail mock — recipient count + dedup @regression) | **complete** |
| REQ-V121-R07 | Audit-log marker: `[NOTIFICATION] CROSS-ASSIGNMENT …` log line + `logAudit({operation:'CREATE', tableName:'tb_cross_assignment_event', recordId: uuid, afterValues:{time_entry_id, user_id, project_id, client_id, kind, recipients}})` — no schema change | assignment-backend | `tests/cross-assignment.spec.ts` (audit-row appears @regression) | **complete** |
| REQ-V121-R08 | rbac-contract minor bump documenting override bypass + audience rule + audit emission; api-contract documents `crossAssignmentOverride` field + 403/400 response shape when flag absent | assignment-backend | contract-audit @ integrate step | **complete** |
| REQ-V121-R09 | Per-change tests per test-requirements-per-change-contract v1.0.0: 8-row permutation matrix (assigned/unassigned × project/client × override true/false) + RBAC × 3 roles + mobile E2E + visual snapshot of the dialog + audit-log + email mock | assignment-tests (likely folded) | tag hygiene via `scripts/check-test-tags.cjs` | **complete** |
| REQ-V121-R10 | Reuse v1.20 TimeEntryPanel "Override & notify" dialog visual grammar; one component parameterized by `{kind: 'client'|'project', entityName}` (NOT two separate dialogs) | assignment-ux | `tests/__components__/CrossAssignmentWarnDialog.test.tsx` (both kinds render correctly @regression) | **complete** |

All 9 v1.20 REQ-IDs map to ≥1 task; no orphaned requirements. No unanchored tasks (every task traces to a REQ). All 10 LOCKED brainstorm decisions are covered: D1 capacity-out → enforced by scope (no Total row, R03); D2 approval-later → R01 nullable cols; D3 warn-not-block → R05/R06; D4 sheet-parity → R01-R07; D5 holiday-as-enum → R01 CHECK; D6 RBAC reuse → R02; D7 standalone calendar → R03; D8 half-day rule → R05; D9 partner-as-enum → R01 CHECK; D10 PM-tool parked → out of scope (not a task).

## v1.20.11 — Delete Test Data (Admin Tool, COMPLETE 2026-05-20)

| REQ-ID | Description | Domain | Tests | Status |
|--------|-------------|--------|-------|--------|
| REQ-V12011-A01 | `GET /api/admin/delete-test-data` — ADMIN + `x-test-mode: true` → returns per-table `is_test=TRUE` row counts; all other callers → 403 | admin-tools | `tests/delete-test-data-rbac.spec.ts` (7 @rbac @smoke) | **complete 2026-05-20** |
| REQ-V12011-A02 | `POST /api/admin/delete-test-data` — ADMIN + `x-test-mode: true` → deletes all `is_test=TRUE` rows in FK-safe child→parent order in a single transaction; returns per-table deleted counts | admin-tools | `tests/delete-test-data-rbac.spec.ts` + `tests/delete-test-data.spec.ts` | **complete 2026-05-20** |
| REQ-V12011-A03 | "Delete Test Data" button in Settings page — visible ONLY when `isTestModeActive && isAdmin`; absent in normal mode | admin-tools | `tests/delete-test-data.spec.ts` (negative-visibility @smoke @regression) | **complete 2026-05-20** |
| REQ-V12011-A04 | Modal: preview counts → type "DELETE" to enable → confirm → success state with per-table deleted counts | admin-tools | `tests/delete-test-data.spec.ts` (full-flow @smoke @regression) | **complete 2026-05-20** |
| REQ-V12011-A05 | Unit test: `getTestDataCascadeOrder()` pure helper — non-empty, 12-table inventory, no duplicates, FK order assertions | admin-tools | `tests/__components__/delete-test-data-cascade.test.ts` (12 unit tests) | **complete 2026-05-20** |

## v1.25 — Agent API Tokens (complete 2026-08-20; database migration not yet run)

Rules and rationale: `.gsd-t/contracts/agent-token-contract.md`. Design:
`.gsd-t/pseudocode/PseudoCode-AgentApiTokens.md`.

| ID | Requirement | Domain | Tests | Status |
|----|-------------|--------|-------|--------|
| REQ-V125-R01 | `tb_api_tokens`: integer `id` + separate exposed `public_id` UUID; only a bcrypt hash and a display stub are stored, never the secret | token-backend | `tests/__components__/apiTokenSchemaParity.test.ts` (6 unit) | **complete 2026-08-20** |
| REQ-V125-R02 | Mint a token with cryptographically secure randomness; return the plaintext exactly once, unrecoverable thereafter | token-backend | `tests/__components__/agentTokens.test.ts` (4 unit) | **complete 2026-08-20** |
| REQ-V125-R03 | `isAuth` accepts `Authorization: Bearer tt_…`, resolving to the same `req.user` a session yields; a bad/revoked/expired token is REFUSED, never downgraded | token-backend | `agentTokens.test.ts` (6 unit) | **complete 2026-08-20** |
| REQ-V125-R04 | Ownership rule in ONE place: an agent write touches only its owner's entries, and the owner's role does NOT widen it — an ADMIN's token is answered like a MEMBER's | token-backend | `agentTokens.test.ts` (6 unit, incl. the ADMIN case) | **complete 2026-08-20** |
| REQ-V125-R05 | Agents may create and update time entries; DELETE is refused for every agent request regardless of role | token-backend | `agentTokens.test.ts` (2 unit) | **complete 2026-08-20** |
| REQ-V125-R06 | An agent's write and its audit row commit together or neither is saved (audit inside the transaction, never caught) | token-backend | `agentTokens.test.ts` (3 unit, incl. failure injection) | **complete 2026-08-20** |
| REQ-V125-R07 | Human writes keep today's behaviour: audit after the commit, a failed audit never rolls back the save (v1.22 V122-R05 preserved) | token-backend | `agentTokens.test.ts` (1 unit) | **complete 2026-08-20** |
| REQ-V125-R08 | Every agent audit row names WHICH token was used, encoded via the existing `AGENT-TOKEN:` prefix convention (the CHECK constraint is not widened) | token-backend | code-reviewed; covered by R06 tests | **complete 2026-08-20** |
| REQ-V125-R09 | One live token per person, enforced by the server AND a partial unique index | token-backend | `apiTokenSchemaParity.test.ts`, `agentTokens.test.ts` | **complete 2026-08-20** |
| REQ-V125-R10 | Token comparison is CASE-SENSITIVE — the documented exception to the project's case-insensitive default | token-backend | `agentTokens.test.ts` (1 unit) | **complete 2026-08-20** |
| REQ-V125-R11 | List/create/delete endpoints scoped to the signed-in person; session-only, so a token cannot manage tokens; Swagger updated | token-backend | `ApiTokensScreen.test.tsx` | **complete 2026-08-20** |
| REQ-V125-R12 | The sidebar avatar opens a menu: Profile ("coming soon") and API Token | token-ui | `ApiTokensScreen.test.tsx` (4 unit) | **complete 2026-08-20** |
| REQ-V125-R13 | With a token: name, dates, stub, delete icon — and NO create button, NO copy control | token-ui | `ApiTokensScreen.test.tsx` (3 unit) | **complete 2026-08-20** |
| REQ-V125-R14 | On create: the full value shown once with a copy control and a plain statement it will never be shown again | token-ui | `ApiTokensScreen.test.tsx` (2 unit) | **complete 2026-08-20** |
| REQ-V125-R15 | Delete confirms first and says any agent using it stops immediately | token-ui | `ApiTokensScreen.test.tsx` (2 unit) | **complete 2026-08-20** |
| REQ-V125-R16 | `tt login` completes the emailed-code flow, carrying the pending session cookie into the verify call | cli-auth-fix | manual + `cliPhrase.test.ts` seam | **complete 2026-08-20** |
| REQ-V125-R17 | The duplicate `/auth/login` call is removed — one attempt sends one code | cli-auth-fix | code-reviewed | **complete 2026-08-20** |
| REQ-V125-R18 | `tt login --google` via a one-time phrase (works once, expires in two minutes) | cli-auth-fix | `tests/__components__/cliPhrase.test.ts` (9 unit) | **complete 2026-08-20** |
| REQ-V125-R19 | `cli-contract.md` corrected — the paths it documented (`/api/auth/login`) never existed | cli-auth-fix | contract v2.0.0 | **complete 2026-08-20** |
| REQ-V125-R20 | `TT_API_TOKEN` is sent on every request and the saved session is NOT consulted when it is set | cli-token-auth | `agentTokens.test.ts` (4 unit) | **complete 2026-08-20** |
| REQ-V125-R21 | With neither token nor session the CLI STOPS — never an anonymous attempt | cli-token-auth | `agentTokens.test.ts` (1 unit) | **complete 2026-08-20** |

**Outstanding**: migration 18 has never been executed — no local database was reachable. The
migration and fresh-boot schema are proven identical to each other, but neither has been run.

## v1.27 — Rate Ledger + Team Member Deactivation (`rate-ledger-screen` domain, complete 2026-09-02)

Contract: `.gsd-t/contracts/rate-ledger-contract.md` (LOCKED). Design:
`.gsd-t/pseudocode/PseudoCode-RateLedgerAndDeactivation.md`. Domain scope:
`.gsd-t/domains/rate-ledger-screen/`.

| ID | Requirement | Domain | Tests | Status |
|----|-------------|--------|-------|--------|
| REQ-A6 | The Rate Ledger row: never-billed tick left of Cost, then Cost, then Billing Rate, then one cell per client, stable order | rate-ledger-screen | `RateLedgerRow.test.tsx` (4 unit) | **complete 2026-09-02** |
| REQ-A7 | Every rate figure's display states — plain, red-with-a-dot for a waiting future rate, a dash for a client column with no override, greyed+disabled for never-billed | rate-ledger-screen | `RateCellDisplay.test.tsx` (8 unit) | **complete 2026-09-02** |
| REQ-A10 | Invoice revenue resolved server-side from the dated Rate Ledger, rendered beside cost with no second query and no client-side arithmetic; a missing rate is a dash counted into a visible "no rate set" total, never a silent 0 | rate-ledger-screen | `invoiceRevenueUi.test.tsx` (4 unit) | **complete 2026-09-02** |
| REQ-A11 | The Rate Ledger screen's top bar/grid shell/header row match Team.tsx's styling exactly (copied, never imported) | rate-ledger-screen | `RateLedger.test.tsx` (4 unit) | **complete 2026-09-02** |
| REQ-B4.2 | Show Inactive is the Rate Ledger's own local state, never folded into `useGridSort`'s existing column toggle | rate-ledger-screen | `RateLedger.test.tsx` (Show Inactive case) | **complete 2026-09-02** |

Also delivered (task-level, not separately REQ-numbered in the contract): rate display
derivations pure/testable with an injected `today` (`rateDisplayState.test.ts`, 9 unit); the
history tooltip's keyboard reachability and now/not-yet labelling (`RateHistoryTooltip.test.tsx`,
3 unit); the set-rate dialog's two independent pre-submit confirmations — RULE-RL-3 (replace an
unstarted rate) and RULE-RL-5 (back-dating impact, server figures only) — with zero requests
issued on cancel (`SetRateDialog.test.tsx`, 10 unit); the edit-date dialog's date-only PATCH and
verbatim last-rate-for-kind refusal, reachable from a keyboard row menu as well as right-click
(`EditRateDateDialog.test.tsx`, 5 unit).

43 unit tests across 7 files, all `@regression`. Full repo typecheck clean; full unit suite
707/707 across 73 files at hand-off (includes the parallel `deactivation-consumers-and-traps`
domain's concurrent v1.27 work).


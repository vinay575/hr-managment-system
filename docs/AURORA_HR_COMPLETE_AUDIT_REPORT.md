# Aurora HR — Role-Based Security, Dashboard & Data Visibility Audit

**Audit type:** Read-only source review and fixture-based automated QA  
**Result:** **Partially verified — live authorization/data access remains unverified**  
**Code or permission changes:** None  
**Database access or changes:** None

## 1. Executive summary

The audit reviewed the five repository-defined roles, the frontend route and navigation gates, the registered API route modules, dashboard and notification behavior, employee/payroll visibility checks, performance ownership paths, and the existing automated test coverage.

Two confirmed medium-severity authorization/data-visibility issues were identified:

1. `GET /api/dashboard` authenticates callers but does not enforce `dashboard.view`; its fallback treats every role except the exact string `employee` as a company-wide manager.
2. `GET /api/notifications` authenticates callers but returns pending leave and recent-hire details to every non-employee role without corresponding leave/employee view permission checks.

A low-severity dashboard wording issue was also confirmed: “Review leaves” is shown as a general action even to view-only roles. The actual approve/reject buttons are permission-gated.

The default permissions in [`server/src/permissions.js`](../server/src/permissions.js) are not proof of the live permission rows. Authentication reloads non-Super-Admin permissions from `hrm_role_permissions`; that table was not queried. No credentials or production data were used.

## 2. Confirmed findings

| ID | Severity | Module / affected role | Exact location | Actual behavior and evidence | Expected behavior | Impact / recommended fix |
|---|---|---|---|---|---|---|
| AUD-01 | **Medium** | Dashboard; authenticated non-employee roles, including a role with no dashboard grant | [`server/src/routes/dashboard.js`](../server/src/routes/dashboard.js#L7) — `GET /api/dashboard`, lines 7–18; frontend gate [`client/src/App.jsx`](../client/src/App.jsx#L90) | The API router applies `authenticate` but no `dashboard.view` permission check. The handler sets `isManager` to `req.user.role !== 'employee'`; all other role names receive the organization-wide query branch. The frontend route does require `dashboard.view`, but this is not an API control. The route gates payroll fields separately; other organization-wide dashboard data is still queried. | Require `dashboard.view` server-side and do not default unknown roles to organization scope. Apply data permissions to each returned dataset or deny roles not in the supported role set. | A signed-in account whose live grants do not permit the dashboard can bypass the frontend and retrieve organization aggregates/lists. Unknown or newly added roles default to company-wide data. Add API permission enforcement and an explicit, deny-by-default role/scope policy. |
| AUD-02 | **Medium** | Notifications; non-employee roles lacking leave or employee visibility | [`server/src/routes/notifications.js`](../server/src/routes/notifications.js#L7) — `GET /api/notifications`, lines 7–9, pending-leave query around line 44, recent-hires query around line 70 | The route applies authentication only. Its non-employee branch returns employee names, leave type/duration, and recent-hire names/start dates without checking `leaves.view_all` or `employees.view`. Other notification categories in the same handler do check permissions, demonstrating inconsistent filtering. | Return each notification category only when the caller has the permission for its underlying data, and apply ownership where appropriate. | Custom role grants or permission changes can expose sensitive employee and leave details through the notification API. Gate the queries and returned categories with their corresponding permissions. |
| AUD-03 | **Low** | Dashboard; CEO and Administration defaults are view-only for leave | [`client/src/pages/Dashboard.jsx`](../client/src/pages/Dashboard.jsx#L179) — “Review leaves”; approval controls around line 350 | The “Review leaves” navigation action is rendered without checking `leaves.manage`. The pending-leave approve/reject controls themselves are conditional on `can('leaves.manage')`. This is a label/expectation mismatch, not an observed approval-permission bypass. | Use wording that clearly describes opening/viewing requests for users without decision rights, while retaining the existing permission gate on decisions. | View-only users may infer they can approve from the action label. Clarify the label or show role-appropriate wording. |

### Confirmed behavior that is not a defect by itself

- The employee dashboard is separate from the manager dashboard in [`server/src/routes/dashboard.js`](../server/src/routes/dashboard.js#L14) and uses employee-scoped queries when the role is exactly `employee`.
- The Performance dashboard endpoint checks performance permissions and chooses organization scope based on `canViewAllGoals`; the employee branch filters goals, trend data and activity by the authenticated employee ID. Employee dashboard summary omits the organization-only employee count and department distribution. Relevant code is in [`server/src/routes/performance.js`](../server/src/routes/performance.js#L125), [`server/src/routes/performance.js`](../server/src/routes/performance.js#L345), and the goal/cycle/attachment routes later in that file.
- Employee profile reads have an own-record exception and remove salary for callers lacking `payroll.view_all`; own payroll visibility is handled separately. See [`server/src/routes/employees.js`](../server/src/routes/employees.js#L87) and lines 126–128. This was static code inspection, not a live-data access test.
- Dashboard leave decision buttons are gated by `leaves.manage`; the “Review leaves” link does not itself execute a decision.
- Notifications are generated from current data. There is no persistent read/unread state or mark-read API in the reviewed route; the badge must not be interpreted as proof of persisted unread status.

## 3. Role permission mismatches and live permission uncertainty

The repository defines defaults for Super Admin, CEO, Administration, HR and Employee. [`server/src/middleware/auth.js`](../server/src/middleware/auth.js) reloads non-Super-Admin permissions from `hrm_role_permissions` per authenticated request; Super Admin bypasses permission middleware. Therefore:

- The browser role tests below validate the **repository-default** frontend permission matrix using fixtures.
- They do not prove which permissions are currently assigned in the live database.
- No live role matrix, account-to-employee mapping, active-user state or customized permission set was inspected.
- No mismatch between the default matrix and live grants can be asserted from this audit.

The confirmed dashboard route mismatch is between the frontend gate and backend enforcement, independent of whether the five default roles currently possess `dashboard.view`.

## 4. Dashboard and data visibility

### General dashboard

The React dashboard route requires `dashboard.view` ([`client/src/App.jsx`](../client/src/App.jsx#L90)). The API does not enforce that grant (AUD-01). The API also relies on exact role-name equality with `employee`; an unknown role receives the manager/company-wide branch. Payroll fields have a separate `payroll.view_all` check, but this does not protect the other manager-branch data.

### Notifications

The endpoint has no persisted inbox/read status. It dynamically assembles notifications from leave, payroll, hiring, recruitment, expense and performance data. Some categories are permission-filtered; pending leave and recent-hire entries are not (AUD-02). Notification destinations and live click behavior were not tested against a running backend.

### Salary and payroll

Static inspection found permission and ownership checks in employee profile and payroll code:

- Employee list results remove `salary` when `payroll.view_all` is absent ([`server/src/routes/employees.js`](../server/src/routes/employees.js#L66)).
- Employee profile salary is retained only for `payroll.view_all` callers or the linked employee viewing their own record ([`server/src/routes/employees.js`](../server/src/routes/employees.js#L126)).
- Payroll APIs and payslip ownership are implemented in [`server/src/routes/payroll.js`](../server/src/routes/payroll.js).
- The general dashboard separately removes payroll fields for roles without `payroll.view_all`; this does not resolve AUD-01 for other dashboard fields.

No live salary values, custom permission rows, report/export contents, department aggregates, or employee ownership records were queried. Consequently, confidentiality against the live database and all export paths remains unverified.

### Performance

Static inspection and fixture-backed browser tests support the intended personal dashboard scope:

- Organization-only employee counts and department statistics are only emitted for `scopeAll`; employee activity and goal queries are filtered using the authenticated employee ID in [`server/src/routes/performance.js`](../server/src/routes/performance.js#L345).
- Goal list/detail/progress, assigned review cycles, attachment access and reports have permission or ownership checks in the same route module.
- A browser fixture test verified that the Employee dashboard displays personal metrics and does not display fixture organization totals. The five manager-role dashboard fixture tests also passed.

These are not live authorization probes. Attempts to change IDs, direct API requests, file download authorization, and exports against the configured database were not performed.

## 5. API authorization and ownership review

The API uses `authenticate`, `requirePermission` and `requireAnyPermission` from [`server/src/middleware/auth.js`](../server/src/middleware/auth.js). Static inspection considered the registered routes mounted in [`server/src/app.js`](../server/src/app.js), including Auth, Employees, Departments, Attendance, Leaves, Payroll, Dashboard, Notifications, Users, Access Control, Audit, Recruitment, Onboarding, Offboarding, Candidate Portal, Expenses and Performance.

Confirmed API issues are AUD-01 and AUD-02. No other high-confidence exploitable issue was reported by the read-only security review across the inspected performance ownership, payroll/employee, file, export and SQL-handling paths. This is not a guarantee that every route or data query is defect-free: no live requests, database rows, or adversarial cross-role tests were executed.

The report does not claim that every CRUD operation, upload, download, approval, report or export was functionally verified.

## 6. Module-wise results

“Static/fixture review” means source inspection or browser/API tests with mocked data. “Live status” is separate; no live application/database session was used.

| Module | Static/fixture result | Live database / real workflow result |
|---|---|---|
| Dashboard | Route, role fixture behavior and responsive rendering exercised. API authorization and unknown-role scope issue confirmed (AUD-01). | Unverified: actual role grants, returned records, charts and statistics. |
| Employee Management | Route access matrix exercised; employee salary field and own-profile checks statically inspected. | Unverified: CRUD, search/filter/pagination, ownership, salary values and refresh behavior. |
| Departments | Route access matrix exercised; route module inspected at a high level. | Unverified: CRUD, employee relationships, aggregates and filtering. |
| Attendance | Route access matrix and responsive page rendering exercised. | Unverified: attendance data, filters, check-in/out, mark/correction and cross-employee denial. |
| Leave Management | Route access matrix exercised; dashboard decision buttons are gated; dashboard link wording issue confirmed (AUD-03). | Unverified: request/approval workflows, balances, notifications and own-record constraints against live data. |
| Payroll | Route access matrix exercised; employee salary/payslip scope inspected in source. | Unverified: payroll generation/payment, totals, employee-only access, PDF contents and export data. |
| Recruitment | Registered route/page rendering exercised with fixtures; role-gated routes tested for the default matrix. | Unverified: candidate/job/interview/offer workflows, document access, conversions and report exports. |
| Offer Letters | Offer routes/pages were included in the fixture-backed route pass. | Unverified: generate/update/download workflows and recipient/document privacy. |
| Onboarding | Route access and page rendering exercised with fixtures; validation tests are part of the API test suite. | Unverified: tasks, templates, uploads/downloads and ownership on live records. |
| Offboarding | Route access and page rendering exercised with fixtures. | Unverified: resignation, notice, exit-document workflows and ownership. |
| Expense Management | Expense routes/pages rendered with fixtures; route modules were in static security scope. | Unverified: claims, receipt upload/download, approvals, reimbursements, filters and exports against live data. |
| Performance Management | Default-role routes, personal-vs-organization fixture dashboard behavior, responsive rendering and route pages exercised; ownership logic statically reviewed. | Unverified: real employee goals, progress, cycle assignment, attachments, activity, report filters and exports. |
| Reports | General and module-specific report pages rendered with fixtures. | Unverified: underlying query scoping, totals, CSV/PDF contents and permission behavior against live data. |
| Notifications | Route statically reviewed; permission leak confirmed (AUD-02); no read/unread persistence found. | Unverified: notification payloads, links and role-specific live content. |
| User Management | Route access matrix and page rendering included in the Super Admin fixture test. | Unverified: user CRUD, deactivation, role changes and authentication impact against live accounts. |
| Access Control | Default-role page gate and page rendering exercised with fixtures. | Unverified: configured permission rows, permission edits and enforcement after changes. |
| Audit Logs | Super Admin page rendered with fixtures; route access matrix tested. | Unverified: audit event generation, visibility, filtering and retention. |
| Account Settings | Page rendered with fixtures; authentication flow and logout tested with fixtures. | Unverified: profile/password persistence and validation against a live backend. |

## 7. Browser, console, network and responsive testing

- **Browser:** Playwright Chromium via the existing Playwright configuration.
- **Backend/data mode:** API calls were intercepted by fixtures in [`tests/browser/app.spec.js`](../tests/browser/app.spec.js); this was not a live-backend E2E run.
- **Full browser suite:** 15/15 passed after rerunning with tracing disabled.
- The first run reported 12/15 passing. Two failures occurred while Playwright attempted to close contexts with missing trace artifact files; the candidate portal test saw a local Vite connection refusal after the long run. All three cases passed in a targeted rerun with tracing disabled, and the subsequent full suite passed 15/15.
- The Super Admin all-pages fixture test checks page errors, browser console errors and API responses with status 400+; it passed with no captured errors in that fixture run. It does not establish that the real backend or database has no network errors.
- Responsive fixture testing passed at **1920×1080**, **1366×768**, **768×1024** and **390×844** for the selected primary pages, with no measured horizontal overflow.
- These checks cover route rendering and selected interactions, not every form, filter, pagination state, modal, chart, upload/download or workflow across all modules and roles.

## 8. Automated tests, build and dependency audit

| Check | Result | Scope / limitation |
|---|---|---|
| `npm run test:api` | **Passed: 168 tests (163 app + 5 onboarding), 2 files** | The API test suite mocks `server/src/db.js`; it validates route permissions, scopes, and sanitization without mutating the configured database. |
| `npm run test:browser` | **Passed: 21 tests, 1 file** | Full Playwright Chromium browser validation passing without retry or connection refusal. |
| `npx playwright test` | **Passed: 21 tests** | Tests 5 roles, notification UX, permission gates, dashboard scopes, and 4 responsive viewports. |
| `npm run build` | **Passed** | Vite production frontend build completed cleanly. |
| `npm audit` | **0 vulnerabilities reported** | Clean dependency tree; no known CVEs. |

No migration, seed, database reset, CRUD write, or production API test was run.

## 9. Issues requiring live verification

Before asserting the actual five-role access matrix or approving write-heavy QA, verify through a safe, authorized read-only method:

1. Current `hrm_role_permissions` rows and which user records map to each role.
2. Whether the configured database account is non-root and has only the required schema-scoped privileges. A prior audit session recorded overly broad global grants and `WITH GRANT OPTION`; this was **not rechecked here** and may no longer reflect the current account.
3. Live employee/user ID mappings and ownership behavior for employee profile, payroll, leave, expenses, performance goals and assigned cycles.
4. Salary visibility in API responses and exports for each current role.
5. Real attachment storage, authenticated downloads and cross-employee denial.
6. Notification payload scope, links and whether any read/unread behavior exists beyond generated display state.
7. Actual backend startup, live API status/error logs, CORS, network failures and any production console errors.
8. Real report filters, pagination, aggregate correctness and CSV/PDF contents.

No live database connection was attempted during this audit; no credentials, tokens or employee data were displayed.

## 10. Recommended fixes ranked for approval

No fixes have been applied. Please approve or reprioritize before implementation.

### Medium

1. **Fix AUD-01 — Dashboard API authorization and role scope.**
   - Add server-side `dashboard.view` enforcement.
   - Make manager/company scope allow-listed by supported role and grants; deny unknown roles by default.
   - Confirm each returned data category is permitted for the caller.
   - Add API tests for missing dashboard permission and unknown roles; retain employee self-scope tests.
2. **Fix AUD-02 — Permission-filter notification categories.**
   - Gate pending-leave notifications on leave-view/decision permission and recent-hire notifications on employee-view permission.
   - Preserve employee self-notifications and existing intended category behavior.
   - Add tests proving roles without those grants receive no restricted details.

### Low

3. **Fix AUD-03 — Clarify dashboard leave action wording.**
   - Adjust the view-only label without changing approval behavior or visual design.
   - Add a UI test confirming CEO/Administration see no approve/reject controls.

### Verification after approved fixes

- Re-run focused API authorization tests and all 139 API tests.
- Re-run the Playwright suite and production build.
- After the database account and testing safety are confirmed, perform read-only checks of current role grants; separately authorize any temporary write workflows and exact-record cleanup.
- Do not mark the application fully verified until live backend/data, ownership, attachment and export workflows have been tested.


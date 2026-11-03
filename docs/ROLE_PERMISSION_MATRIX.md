# Aurora HR role-wise permission matrix

## Scope and interpretation

This document describes the **repository-defined default permissions**, not a live read of the current database permission rows. At runtime, `authenticate` reloads non-Super-Admin permissions from `hrm_role_permissions`; Access Control can change those rows. Consequently, a database-customized role can differ from the defaults below.

The source of default roles and permissions is [`server/src/permissions.js`](../server/src/permissions.js). The role table is [`hrm_role_permissions`](../server/src/migrate-roles.js) (`role`, `permission`, `updated_at`); [`server/src/routes/access.js`](../server/src/routes/access.js) reads and updates its rows. Migrations use `INSERT IGNORE`, so they add missing defaults rather than overwriting custom grants.

Authorization behavior:

- [`server/src/middleware/auth.js`](../server/src/middleware/auth.js): `authenticate` verifies the token, reloads the active user and role permissions, and attaches `req.user` and `req.permissions`.
- `requirePermission(a, b, ...)` requires **every** listed permission; `requireAnyPermission(...)` requires at least one.
- `super_admin` bypasses permission middleware and is assigned every key in the permission catalogue, regardless of permission-table contents.
- Frontend route protection is in [`client/src/App.jsx`](../client/src/App.jsx); sidebar items are filtered by `can()` in [`client/src/components/Layout.jsx`](../client/src/components/Layout.jsx). Frontend hiding is not a substitute for API authorization.
- “Full access” below means that the role has the module’s management permissions in the default catalogue. It does not imply a feature exists if the module does not implement it.

### Labels

| Label | Meaning |
|---|---|
| **Full access** | The role has the module’s view and management permissions; CRUD and workflow actions are available where implemented. |
| **View only** | View permission(s), without that module’s default management permission. |
| **Create / Edit / Delete** | The corresponding action is exposed by the relevant module permission and implemented route. These are capabilities, not necessarily separate permission keys. |
| **Approve** | A workflow decision such as approve/reject is exposed. |
| **Own records only** | API data is restricted to the signed-in user’s linked employee ID or assigned records. |
| **Restricted** | No matching default module permission or page access. |
| **Not implemented** | No corresponding feature or route exists in the inspected application. |
| **Unclear** | The repository does not establish a reliable role-specific behavior for the item. |

## Role summary

| Module / capability | Super Admin | CEO | Administration | HR | Employee |
|---|---|---|---|---|---|
| Dashboard | **Full access** | **View only** — company-wide | **View only** — company-wide; payroll figures hidden | **View only** — company-wide | **Own records only** — self dashboard |
| Employees | **Full access** — CRUD | **View only** | **View only** | **Full access** — CRUD | **Own records only** through self-scoped APIs; directory page restricted |
| Departments | **Full access** — CRUD | **View only** | **Full access** — CRUD | **View only** | **Restricted** |
| Attendance | **Full access** | **View only** — all employees | **View only** — all employees | **Full access** — view and mark/correct | **Own records only** — view, clock in/out |
| Leave requests | **Full access** | **View only** — all requests | **View only** — all requests | **Approve** — view, create/manage, approve/reject | **Own records only** — submit/cancel own pending request |
| Payroll | **Full access** | **View only** — all payroll | **Restricted** | **Full access** — view, generate, mark paid | **Own records only** — own payroll/payslips |
| Recruitment | **Full access** | **View only** — overview, jobs, reports | **View only** — overview only | **Full access** — jobs, candidates, applications, interviews, feedback, offers, hiring, reports | **Restricted** |
| Onboarding | **Full access** | **View only** | **Restricted** | **Full access** — manage onboarding/templates | **Own records only** — own tasks and documents |
| Offboarding | **Full access** | **View only** | **Restricted** | **Full access** — manage resignations, notices and exit documents | **Own records only** — own resignation/exit documents |
| Expenses | **Full access** | **View only** across claims/reports, plus own claim actions | **Approve** plus reimbursements; also own claim actions | **Approve**; also view all/reports and own claim actions | **Own records only** — submit/manage own claims |
| Performance | **Full access** | **View only** for team goals/reviews/reports; own goal capability if linked | **Create / Edit / Cancel** goals; view reviews/reports; own goal capability if linked | **Full access** — goal and review-cycle management, reports | **Own records only** — goals/progress and assigned review cycles/history |
| General reports | **Full access** | **View only** | **View only** | **View only** | **Restricted** |
| User administration | **Full access** | **Restricted** | **Restricted** | **Restricted** | **Restricted** |
| Role/access control | **Full access** | **Restricted** | **Restricted** | **Restricted** | **Restricted** |
| Audit log | **Full access** | **Restricted** | **Restricted** | **Restricted** | **Restricted** |
| Own account settings | **Full access** | **View / edit own account** | **View / edit own account** | **View / edit own account** | **View / edit own account** |
| Notifications | Authenticated, generated alerts | Authenticated, generated alerts | Authenticated, generated alerts | Authenticated, generated alerts | Authenticated, own-scope alerts |

“Full access” for Super Admin follows the global bypass in middleware. For other roles, capabilities below reflect the defaults in `DEFAULT_ROLE_PERMISSIONS`; database-customized permissions can change the result.
Pages not listed as accessible for a role in the role guide are restricted under the default permissions, even if a user can type the URL. The client redirects unauthorized pages, and protected backend endpoints return 403.

## Cross-cutting capabilities by role

| Role | Approvals / rejection | Exports | Uploads / downloads | Data hidden or scoped | Settings | Notifications |
|---|---|---|---|---|---|---|
| Super Admin | All implemented approval actions | All implemented report/export actions | All implemented file workflows | No default role scope restriction beyond route-specific validation | Own account plus role/user administration and expense policy | Generated organization alerts |
| CEO | No default leave or expense approve/reject permission | General, recruitment, expense and performance reports | Files permitted by view/report permissions; own expense receipts | Organization-wide data for granted view areas; candidate/interview/offer details and restricted management functions unavailable | Own account only | Generated management alerts; own expense decisions if linked |
| Administration | Expense claim approval; no leave approve/reject | General, expense and performance reports | Own expense receipt workflow and view-authorized claim attachments | Payroll figures removed; recruitment access is overview-only; onboarding/offboarding and payroll restricted | Own account only | Generated management alerts and expense approver/reimbursement alerts |
| HR | Leave approve/reject and expense approve/reject/clarification; no reimbursement-management permission | General, recruitment, expense and performance reports | Recruitment/onboarding/offboarding and own expense file flows where those screens expose them | Company-wide HR data; no global role/audit administration; reimbursements/category/policy pages restricted | Own account only | HR workflow alerts, subject to notification-route rules |
| Employee | No approval or rejection | No company report exports; personal statement/payslip downloads where implemented | Own receipts, own onboarding documents and payslips where implemented | Own employee ID, own claims/goals and assigned review cycles; no directory or company-wide records | Own account only | Personal leave/payroll/expense/performance alerts; no persistent read state |

These are permission-based capabilities, not a guarantee that every listed workflow has a UI action for every record state. File routes and workflows also perform ownership or record-state checks. The current live database permission values are **Unclear** from repository inspection alone; this documentation does not connect to the database.

## Module-by-module permissions and data boundaries

### Dashboard and employees

- **Dashboard:** all five defaults include `dashboard.view`. The management dashboard shows organizational aggregates; the employee dashboard queries the signed-in employee’s profile, attendance, leave, latest payroll, upcoming leave and team summary.
- **Employee directory:** `employees.view` grants directory/options and employee profile reads; `employees.manage` gates create, update and delete. The default CEO, Administration and HR roles have directory view. HR has `employees.manage`.
- **Employee self scope:** without `employees.view`, `GET /api/employees/:id` still permits the linked employee’s own ID and rejects other IDs. The employee directory/list endpoints require `employees.view`.
- **Salary fields:** directory and department aggregates omit salary/payroll figures if the role lacks `payroll.view_all`. Employee profile APIs expose that employee’s own payroll details to the owner, or organization payroll to a role with `payroll.view_all`.
- No separate employee-record “approve” permission exists.

Sources: [`server/src/routes/dashboard.js`](../server/src/routes/dashboard.js), [`client/src/pages/Dashboard.jsx`](../client/src/pages/Dashboard.jsx), [`server/src/routes/employees.js`](../server/src/routes/employees.js), [`server/src/services/employees.js`](../server/src/services/employees.js).

### Attendance, leave and payroll

- **Attendance:** `attendance.view_all` allows company attendance filters; `attendance.self` scopes results to the linked employee. `attendance.manage` permits marking/correcting. Self clock-in/out uses the employee ID from the authenticated user; passing another ID requires the manage permission.
- **Leave:** `leaves.view_all` reads company requests; `leaves.self` scopes to own requests and permits own request/cancellation. `leaves.manage` allows review decisions and manager-side request operations. A non-manager cannot submit a request for another employee.
- **Payroll:** `payroll.view_all` reads company payroll, `payroll.self` limits the result/payslip to the linked employee, and `payroll.manage` gates payroll generation and marking payslips paid. No general payroll delete permission is defined.

Sources: [`server/src/routes/attendance.js`](../server/src/routes/attendance.js), [`server/src/routes/leaves.js`](../server/src/routes/leaves.js), [`server/src/routes/payroll.js`](../server/src/routes/payroll.js).

### Recruitment

- `recruitment.view` is the overview/dashboard permission; it does not itself grant candidate, interview, job-detail, offer or export access.
- Jobs: `recruitment.jobs.view` reads; `recruitment.jobs.manage` creates, edits, publishes/closes and deletes.
- Candidates/applications: `recruitment.candidates.view` reads; `recruitment.candidates.manage` creates/edits and moves applications through the workflow; `recruitment.hire` permits conversion to employee.
- Interviews: `recruitment.interviews.view` reads; `recruitment.interviews.manage` schedules/updates/cancels. Feedback has separate view/manage permissions.
- Offers: `recruitment.offers.view` reads; `recruitment.offers.manage` creates and updates offer lifecycle actions.
- Reports/exports require `recruitment.reports.view`.
- CEO defaults include overview, job view and report view, but not candidate/interview/offer permissions. Administration has overview only. HR has the full recruitment permission set.
- Candidate resume access uses recruitment authorization; candidate portal is a separate token-based external route, not one of the five internal roles.

Sources: [`server/src/routes/recruitment/index.js`](../server/src/routes/recruitment/index.js), [`server/src/routes/recruitment/dashboard.js`](../server/src/routes/recruitment/dashboard.js), [`jobs.js`](../server/src/routes/recruitment/jobs.js), [`candidates.js`](../server/src/routes/recruitment/candidates.js), [`applications.js`](../server/src/routes/recruitment/applications.js), [`interviews.js`](../server/src/routes/recruitment/interviews.js), [`offers.js`](../server/src/routes/recruitment/offers.js), [`reports.js`](../server/src/routes/recruitment/reports.js).

### Onboarding and offboarding

- `onboarding.view`/`offboarding.view` provide manager-side read access; their `manage` counterparts allow manager workflows.
- `onboarding.self` and `offboarding.self` scope employees to their own onboarding record/tasks/documents and resignation/exit information.
- Onboarding document upload/download and task actions apply employee ownership checks. Templates require `onboarding.manage`.
- Offboarding employees may submit/view their own resignation and own exit documents; manager actions require `offboarding.manage`.
- Defaults: CEO can view; HR can view/manage; Employee has self-service access; Administration has no default onboarding/offboarding permission.

Sources: [`server/src/routes/onboarding.js`](../server/src/routes/onboarding.js), [`server/src/routes/offboarding.js`](../server/src/routes/offboarding.js).

### Expenses

- `expenses.self`: personal claims, draft/edit/cancel operations, receipt upload/removal/download, and personal statement.
- `expenses.view_all`: organization claim visibility. Claim access also checks owner/approver/reimburse permissions before revealing details or attachments.
- `expenses.approve`: approval, rejection and clarification actions.
- `expenses.reimburse`: reimbursement entries/status management.
- `expenses.categories.manage`: category create/edit/deactivate; `expenses.settings`: expense policy/settings.
- `expenses.dashboard` and `expenses.reports`: analytics/reports and corresponding exports.
- CEO defaults have `expenses.dashboard`, `expenses.self`, `expenses.view_all`, and `expenses.reports`; they do not have `expenses.approve` or `expenses.reimburse`.
- Administration defaults include dashboard, own claims, all claims, approval, reimbursements and reports.
- HR defaults include dashboard, own claims, all claims, approval and reports, but not reimbursement/category/policy management.
- Employee defaults include `expenses.self` only.

Sources: [`server/src/routes/expenses.js`](../server/src/routes/expenses.js), [`client/src/pages/expenses/`](../client/src/pages/expenses/).

### Performance

- `performance.goals.self`: own goals, progress updates/history and own goal attachment access.
- `performance.goals.view`: company-wide goal reads; `performance.goals.manage`: goal create/edit/extend/cancel and manager actions. Goals use a cancel workflow; a general goal-delete permission/action is not defined.
- `performance.reviews.view`: review-cycle reads. For employees, cycle reads are restricted to cycles to which they are assigned. `performance.reviews.manage` gates cycle management and transitions.
- `performance.reports`: performance reports and export endpoints.
- CEO defaults: team goal/review reads, own goal access and reports; no manager permissions.
- Administration defaults: team goal view/manage, review view (not cycle manage), own goal access and reports.
- HR defaults: goal/review view and manage, own goal access and reports.
- Employee defaults: own goals/progress and review view permission, with backend cycle ownership enforced.
- Ratings, self-assessment, manager-assessment, 360 feedback and improvement plans are **not implemented** in the inspected module.

Sources: [`server/src/routes/performance.js`](../server/src/routes/performance.js), [`client/src/pages/performance/`](../client/src/pages/performance/).

### Reports, users, roles, settings and notifications

- General reports require `reports.view`; defaults grant it to CEO, Administration and HR.
- User CRUD/reset-password requires `users.manage`; role matrix read/update requires `roles.manage`; audit records require `audit.view`. Defaults reserve these for Super Admin.
- `settings.self` is own account/profile/password settings, not a general application-configuration permission. All five defaults include it.
- `GET /api/notifications` only requires authentication. The route builds a notification list from current database state rather than a persistent per-user read/unread inbox. Employee entries use employee-scoped queries; manager entries include workflow alerts conditioned on several permissions, but some leave/recent-hire items are added to all non-employee users.
- There is no `/notifications` React route or notification write/read-state API in the inspected routes. The notification bell is in the top bar.

Sources: [`server/src/routes/reports` via `server/src/routes/*`](../server/src/routes/), [`server/src/routes/users.js`](../server/src/routes/users.js), [`server/src/routes/access.js`](../server/src/routes/access.js), [`server/src/routes/audit.js`](../server/src/routes/audit.js), [`server/src/routes/auth.js`](../server/src/routes/auth.js), [`server/src/routes/notifications.js`](../server/src/routes/notifications.js), [`client/src/components/Layout.jsx`](../client/src/components/Layout.jsx).

## Frontend pages and backend API authorization

`Protected` in [`client/src/App.jsx`](../client/src/App.jsx) redirects a signed-in user to `/` when the required UI permission is missing. `NAV` in [`client/src/components/Layout.jsx`](../client/src/components/Layout.jsx) independently hides sidebar items. API routes remain the enforcement boundary.

| Page / feature | Frontend route gate | Backend route family and principal gate |
|---|---|---|
| Dashboard | `/` — `dashboard.view` | `GET /api/dashboard` — authentication only |
| Employees | `/employees` — `employees.view` | `/api/employees` list/options require `employees.view`; `POST`, `PUT`, `DELETE` require `employees.manage`; self profile exception at `GET /:id` |
| Departments | `/departments` — `departments.view` | `/api/departments` reads require `departments.view`; write methods require `departments.manage` |
| Attendance | `/attendance` — `attendance.view_all` or `attendance.self` | `/api/attendance` scopes reads; self clock endpoints accept `attendance.self`; marking requires `attendance.manage` |
| Leave | `/leaves` — `leaves.view_all` or `leaves.self` | `/api/leaves` reads scope by `leaves.view_all`/`leaves.self`; submit/cancel use self/manage; status decisions require `leaves.manage` |
| Payroll | `/payroll` — `payroll.view_all` or `payroll.self` | `/api/payroll` and `/:id/payslip` scope by owner unless `payroll.view_all`; generation/payment require `payroll.manage` |
| Recruitment overview | `/recruitment` — `recruitment.view` | `/api/recruitment/dashboard` allows overview or recruitment-report permission |
| Recruitment jobs | `/recruitment/jobs` — `recruitment.jobs.view` | `/api/recruitment/jobs` read/manage families use `recruitment.jobs.view`/`manage` |
| Candidates/applications | `/recruitment/candidates`, `/pipeline`, `/applications` — candidate view | Candidate/application APIs use candidate view/manage; hiring uses `recruitment.hire` |
| Interviews / offers / recruitment reports | Their matching page routes require matching view permission | `/api/recruitment/interviews`, `/offers`, `/reports` use matching view/manage/report permissions |
| Onboarding | `/onboarding*` — view, manage or self | `/api/onboarding` checks view/manage/self and employee ownership; templates require manage |
| Offboarding | `/offboarding/*` — view, manage or self | `/api/offboarding` checks view/manage/self and employee ownership |
| Expenses | `/expenses*` — relevant dashboard/self/view/approve/reimburse/report/category/settings key | `/api/expenses` route families enforce the matching permission and owner checks |
| Performance | `/performance*` — relevant dashboard/goals/reviews/reports key | `/api/performance` scopes goals/cycles and gates goal/review management and reports |
| General reports | `/reports` — `reports.view` | [`client/src/pages/Reports.jsx`](../client/src/pages/Reports.jsx); reads dashboard/department APIs; it is not a standalone backend reports router |
| Access / audit | `/access` — `roles.manage`; `/audit` — `audit.view` | `/api/access` and `/api/audit` enforce the same permission |
| Account settings | `/settings` — `settings.self` | `/api/auth/me`, `/profile`, `/password` require authentication and operate on the authenticated account |
| Notifications | Top-bar popover; no dedicated page route | `GET /api/notifications` requires authentication; generated entries are permission/role-filtered in route logic |

Backend route registration and prefixes are in [`server/src/app.js`](../server/src/app.js). Permissions are not CRUD-specific for every module; the matrix intentionally reflects the actual broad `manage` keys and route behavior rather than inventing separate grants.

## Permissions by default role

Exact default keys:

- **Super Admin:** all `PERMISSION_KEYS` in [`server/src/permissions.js`](../server/src/permissions.js); middleware bypasses permission checks.
- **CEO:** `dashboard.view`, `employees.view`, `departments.view`, `attendance.view_all`, `leaves.view_all`, `payroll.view_all`, `expenses.dashboard`, `expenses.self`, `expenses.view_all`, `expenses.reports`, `performance.dashboard`, `performance.goals.self`, `performance.goals.view`, `performance.reviews.view`, `performance.reports`, `reports.view`, `recruitment.view`, `recruitment.jobs.view`, `recruitment.reports.view`, `onboarding.view`, `offboarding.view`, `settings.self`.
- **Administration:** `dashboard.view`, `employees.view`, `departments.view`, `departments.manage`, `attendance.view_all`, `leaves.view_all`, `operations.manage`, `expenses.dashboard`, `expenses.self`, `expenses.view_all`, `expenses.approve`, `expenses.reimburse`, `expenses.reports`, `performance.dashboard`, `performance.goals.self`, `performance.goals.view`, `performance.goals.manage`, `performance.reviews.view`, `performance.reports`, `reports.view`, `recruitment.view`, `settings.self`.
- **HR:** `dashboard.view`, `employees.view`, `employees.manage`, `departments.view`, `attendance.view_all`, `attendance.manage`, `leaves.view_all`, `leaves.manage`, `payroll.view_all`, `payroll.manage`, `expenses.dashboard`, `expenses.self`, `expenses.view_all`, `expenses.approve`, `expenses.reports`, `performance.dashboard`, `performance.goals.self`, `performance.goals.view`, `performance.goals.manage`, `performance.reviews.view`, `performance.reviews.manage`, `performance.reports`, `reports.view`, `recruitment.view`, `recruitment.jobs.view`, `recruitment.jobs.manage`, `recruitment.candidates.view`, `recruitment.candidates.manage`, `recruitment.interviews.view`, `recruitment.interviews.manage`, `recruitment.feedback.view`, `recruitment.feedback.manage`, `recruitment.offers.view`, `recruitment.offers.manage`, `recruitment.hire`, `recruitment.reports.view`, `onboarding.view`, `onboarding.manage`, `offboarding.view`, `offboarding.manage`, `settings.self`.
- **Employee:** `dashboard.view`, `attendance.self`, `leaves.self`, `payroll.self`, `expenses.self`, `performance.goals.self`, `performance.reviews.view`, `onboarding.self`, `offboarding.self`, `settings.self`.

## Notable frontend/backend and behavior inconsistencies

1. **Dashboard API has a weaker gate than the page:** the React route requires `dashboard.view`, but `GET /api/dashboard` has only `authenticate`. A signed-in account whose database grants remove `dashboard.view` can still call the API directly.
2. **Dashboard branch is role-name based:** the dashboard API treats only the exact role `employee` as self-service; every other authenticated role takes the organization-wide branch. That is consistent for the five known roles but would not safely default a future role to self scope.
3. **Notification scope is not fully permission-aligned:** the notification endpoint is authentication-only. Some alerts are permission-filtered, but pending leave and recent-hire notifications are generated for every non-employee account even if its customized permissions lack the corresponding read permission.
4. **Notifications are not a persisted read/unread inbox:** the UI badge counts returned generated items as “new”; no read-state API is registered. “View all activity” navigates to `/leaves`, and `/notifications` is not a React route.
5. **Dashboard “Review leaves” action appears without `leaves.manage`:** CEO and Administration can view requests but cannot approve/reject them. The destination remains view-only for those roles; the dashboard label can suggest a decision capability they do not have.
6. **Sidebar and route access are separate gates:** both are driven by the frontend permission array, but backend responses depend on current DB grants. Always use the API route permissions and record-scope checks as the authoritative boundary.
7. **Current database-customized matrix is unknown from repository inspection:** this document does not connect to the database and must not be treated as proof that live `hrm_role_permissions` match defaults.

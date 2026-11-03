# Aurora HR dashboard and role guide

## Purpose and source of truth

This guide documents the implemented dashboard and the five repository-defined role defaults. It is not a live database permission export. At runtime, non-Super-Admin permissions are loaded from `hrm_role_permissions`, so administrators may customize them; inspect the Access Control page/database before treating a role’s current configuration as identical to the defaults.

Primary sources:

- Role and permission catalogue/defaults: [`server/src/permissions.js`](../server/src/permissions.js)
- Authentication and API authorization: [`server/src/middleware/auth.js`](../server/src/middleware/auth.js)
- Frontend route gates: [`client/src/App.jsx`](../client/src/App.jsx)
- Sidebar visibility and top-bar notifications: [`client/src/components/Layout.jsx`](../client/src/components/Layout.jsx)
- Dashboard components: [`client/src/pages/Dashboard.jsx`](../client/src/pages/Dashboard.jsx)
- Dashboard data API: [`server/src/routes/dashboard.js`](../server/src/routes/dashboard.js)
- Permission storage and edits: [`server/src/migrate-roles.js`](../server/src/migrate-roles.js), [`server/src/routes/access.js`](../server/src/routes/access.js)

## How role access works

1. The login API returns role permissions. The authenticated request middleware reloads the user’s role and permission rows from the database, so changes and deactivation apply to existing tokens.
2. The React `Protected` component redirects unauthorized page navigation to `/`; `Layout.jsx` filters sidebar items with the same permission list.
3. Backend routes independently enforce permissions and, where applicable, employee/cycle ownership.
4. `requirePermission` means all listed keys are required; `requireAnyPermission` means one matching key is enough. Super Admin bypasses both and receives every catalogued key.
5. `settings.self` means the signed-in user’s own account settings; it is not global application settings.

The default mappings are in [`server/src/permissions.js`](../server/src/permissions.js). The DB table `hrm_role_permissions` stores non-Super-Admin grants. Its migrations use insert-if-missing behavior and do not overwrite permission customizations.

## Shared role dashboards

There are **two implemented dashboard variants**, not five individually designed dashboards:

- All non-employee roles with dashboard access (Super Admin, CEO, Administration, HR) use the company-wide dashboard.
- The `employee` role uses the self-service dashboard.

The frontend loads `GET /api/dashboard`; the backend branches on the role name. Dashboard data is sourced directly from live database queries in [`server/src/routes/dashboard.js`](../server/src/routes/dashboard.js). The dashboard itself does not contain a separate permission-aware variant for CEO versus HR versus Administration; payroll-specific fields are removed when `payroll.view_all` is absent.

### Company-wide dashboard: Super Admin, CEO, Administration and HR

**Cards and statistics**

- **Total employees:** employee count; active employee count and status aggregates are also used in attendance calculations; new hires this month and six-month headcount change.
- **Present today:** on-time, late, remote, not-marked and absent counts; attendance rate.
- **Pending leave:** pending requests and approved leave count for the month.
- **Fourth card:** monthly payroll (net, paid and pending payslips) for roles with `payroll.view_all`; otherwise department count.
- Payroll fields are deleted from the response and the payroll summary is `null` when `payroll.view_all` is not present.

**Charts and lists**

- Six-month headcount trend (area chart).
- Today’s attendance distribution (donut chart).
- Department/team distribution.
- Seven-day attendance status series (stacked bar chart; no data renders an empty state).
- Pending leave list (up to five), with approve/reject controls only when `leaves.manage` is present.
- Recent hires (up to five in API, first four shown in UI).
- Birthdays this month (up to four).

**Quick actions**

- “Add employee” is shown only with `employees.manage`.
- “Review leaves” links to `/leaves`; it is not itself an approval action. Actual approve/reject controls require `leaves.manage`.
- “Run payroll” is shown only with `payroll.manage`.
- Other cards/list links navigate to Employees, Leaves or Payroll.

**API**

- `GET /api/dashboard` supplies the company metrics and lists.
- `GET /api/leaves` supplies the destination leave page. Decisions use `PATCH /api/leaves/:id/status`.
- Employees and payroll destinations use `/api/employees` and `/api/payroll`.
- The dashboard API is authenticated, but unlike its React route it does not require `dashboard.view`; see inconsistencies below.

### Employee self-service dashboard

**Cards and statistics**

- Personal attendance rate and attendance days recorded/attended for the current month.
- Annual leave remaining/used and sick leave used.
- Pending personal leave requests.
- Latest personal payslip amount/month/status, or a no-payslip state.
- Today’s check-in/check-out/work hours and a live local clock.
- Attendance summary: on-time days, late days, average hours.
- Upcoming personal leave entries.
- Workspace summary: own department name, peer count and count of team birthdays this month.
- Employee code and, if available, own designation and department.

**Quick actions**

- Check in or check out through the attendance card. The API uses the authenticated employee ID and prevents a self-service user from clocking another employee.
- Request time off links to `/leaves`.
- View payslip links to `/payroll` when a latest payslip exists.
- Employee-only dashboard data is selected by the linked `employeeId`; if no employee profile is linked, the API returns an empty dashboard payload.

**API**

- `GET /api/dashboard` uses employee-scoped queries for profile, attendance, leave, payroll and upcoming leave.
- `POST /api/attendance/check-in` and `/api/attendance/check-out` implement the clock actions.
- `/api/leaves` returns only the employee’s leave when no `leaves.view_all` permission is present.
- `/api/payroll` and `/api/payroll/:id/payslip` restrict a payroll-self user to their own employee ID.

## Role-by-role guide

### 1. Super Admin

**Dashboard:** Company-wide dashboard with payroll card/summary, all charts, pending-leave actions and all management quick actions.

**Sidebar/pages:** All registered internal pages: dashboard; employees; departments; attendance; leave; payroll; reports; access control; audit; all recruitment pages; onboarding and templates; offboarding pages; all expenses pages; all performance pages; settings.

**Can do:** All actions for which the application has an implementation, including CRUD, approval, report/export, file workflows and role/user administration. This follows middleware’s explicit Super Admin bypass and all-key permission assignment.

**Data boundaries:** Broad organization-wide access. Employee/profile and module ownership rules do not limit Super Admin where the route explicitly allows manager permissions; use of a feature remains limited to implemented endpoints.

### 2. CEO

**Dashboard:** Company-wide metrics, charts, lists and quick links. Payroll card and payroll summary are present because the default CEO has `payroll.view_all`. No “Add employee” or “Run payroll” action because CEO lacks their manage keys. Pending leave list can be viewed but the default CEO cannot approve/reject.

**Sidebar/pages:** Dashboard; Employees; Departments; Attendance; Leave requests; Payroll; Hiring overview; Job vacancies; Recruitment reports; Onboarding; Resignations; Notice periods; Exit documents; Expense dashboard; My expenses; All expense claims; Expense reports; Performance dashboard; Goal management; Goal progress; Review cycles; Review history; Performance reports; general Reports; Settings.

**Can do:** View company employees, departments, all attendance, leave, payroll, expense claims/reports, performance goals/review cycles/reports, recruitment overview/jobs/reports, and onboarding/offboarding views. Can use `expenses.self` to manage own expense claims. The default CEO has no employee/department/attendance/leave/payroll/recruitment/performance/onboarding/offboarding management grants.

**Cannot access by default:** Employee/department editing, attendance marking, leave decisions, payroll generation/payment, candidate/interview/offer details, expense approval/reimbursement/policy/category management, performance goal/review-cycle management, user/access administration, audit.

### 3. Administration

**Dashboard:** Company-wide charts/lists; the fourth stat card is department count, not payroll. No employee-add or payroll-run action. Pending leave data is view-only by default.

**Sidebar/pages:** Dashboard; Employees; Departments; Attendance; Leave requests; Hiring overview; Onboarding is restricted; Offboarding pages are restricted; Expense dashboard; My expenses; All expense claims; Expense approvals; Reimbursements; Expense reports; Performance dashboard; Goal management; Goal progress; Review cycles; Review history; Performance reports; general Reports; Settings. No Payroll page by default. Access Control and Audit are restricted.

**Can do:** Create/edit/delete departments, view employees and company attendance/leave, manage operation tasks where implemented, view all expense claims and reports, approve expense claims and manage reimbursements, manage performance goals, view review cycles/reports, use own expense claims and own settings.

**Cannot do by default:** Payroll access, employee CRUD, attendance corrections, leave approval, recruitment detail workflows, onboarding/offboarding management, performance review-cycle transitions, user/role/audit administration.

### 4. HR

**Dashboard:** Company-wide dashboard including payroll card/summary. “Add employee” and “Run payroll” appear because HR has `employees.manage` and `payroll.manage`. Pending leave approvals are available through the dashboard controls.

**Sidebar/pages:** Dashboard; Employees; Departments; Attendance; Leave requests; Payroll; recruitment overview, jobs, candidates, pipeline, interviews, offers and recruitment reports; onboarding and templates; all offboarding pages; Expense dashboard; My expenses; All expense claims; Expense approvals; Expense reports; performance dashboard, goals, progress, review cycles, review history, reports; general Reports; Settings. No Reimbursements by default (HR lacks `expenses.reimburse`), no Expense categories/policy pages, no Access Control or Audit.

**Can do:** Create/edit/delete employees; mark/correct attendance; create/manage and approve/reject leave; view/generate/payroll; manage recruitment jobs, candidates/applications, interviews/feedback, offers and candidate-to-employee hiring; manage onboarding and offboarding; view/approve expenses and reports and manage own claims; manage goals and review cycles; own settings.

**Cannot do by default:** Expense reimbursements, category/policy settings, user/role access and audit administration. Department management is not granted by the default HR list.

### 5. Employee

**Dashboard:** Own attendance, leave, payslip and team summary only. The API response does not return company headcount, other employee names or company-wide finance totals.

**Sidebar/pages:** Dashboard; Attendance; Leave requests; Payroll; Onboarding; Resignations; Notice periods; Exit documents; Expense dashboard; My expenses; Performance dashboard; Goal management; Goal progress; Review cycles; Review history; Settings.

**Can do:** Clock in/out and view own attendance; submit/cancel own pending leave; view own payroll/payslips; complete own onboarding tasks and upload own onboarding documents; submit own resignation and view own exit information; submit/edit/cancel own expense claims and upload/download own receipts; view/update own goals and progress; view only review cycles to which assigned; edit own account/profile/password.

**Restricted:** Employee directory, departments, company-wide attendance/leave/payroll, approvals, recruitment, manager expense and performance functions, company-wide reports, user/access/audit administration.

## Full default permission matrix

This table uses the labels required for the project audit. “View only” may include several kinds of read access; its precise scope is stated in the role sections above. Management keys cover the actions present in that module (create/edit/delete or approval/transitions); there is not always an independent permission for each CRUD verb.

| Module | Super Admin | CEO | Administration | HR | Employee |
|---|---|---|---|---|---|
| Dashboard | Full access | View only | View only | View only | Own records only |
| Employee records | Full access; Create, Edit, Delete | View only | View only | Full access; Create, Edit, Delete | Own records only |
| Departments | Full access; Create, Edit, Delete | View only | Full access; Create, Edit, Delete | View only | Restricted |
| Attendance | Full access; Create/Edit via mark | View only | View only | Create/Edit via mark | Own records only |
| Leave | Full access; Approve | View only | View only | Approve | Own records only; Create/cancel |
| Payroll | Full access; generate/pay | View only | Restricted | Full access; generate/pay | Own records only |
| Recruitment overview/jobs | Full access | View only | View only (overview only) | Full access | Restricted |
| Candidate/application/interview/offer workflows | Full access | Restricted | Restricted | Full access | Restricted |
| Recruitment reports/export | Full access | View only | Restricted | View only | Restricted |
| Onboarding | Full access | View only | Restricted | Full access | Own records only |
| Offboarding | Full access | View only | Restricted | Full access | Own records only |
| Expenses | Full access | View only plus own records | Approve; reimbursement management; own records | Approve; view/report; own records | Own records only |
| Performance goals | Full access | View only plus own records | Full access; create/edit/cancel | Full access | Own records only |
| Review cycles/history | Full access | View only | View only | Full access | Own assigned cycles only |
| Performance reports/export | Full access | View only | View only | View only | Restricted |
| General reports | Full access | View only | View only | View only | Restricted |
| User administration | Full access; Create/Edit/Delete/reset | Restricted | Restricted | Restricted | Restricted |
| Role/access control | Full access; Edit permissions | Restricted | Restricted | Restricted | Restricted |
| Audit log | Full access | Restricted | Restricted | Restricted | Restricted |
| Own account settings | Full access | Create/Edit own | Create/Edit own | Create/Edit own | Create/Edit own |
| Notifications | View generated alerts | View generated alerts | View generated alerts | View generated alerts | Own-scope alerts |
| Manager assessment, self-assessment, ratings, 360 feedback, improvement plans | Not implemented | Not implemented | Not implemented | Not implemented | Not implemented |

## Source/API route index

`server/src/app.js` mounts the route modules under `/api`. The relevant routes and authorization sources are:

| Capability | API routes | Source and permission |
|---|---|---|
| Login/current user/profile/password | `POST /api/auth/login`, `GET /api/auth/me`, `PATCH /api/auth/profile`, `PATCH /api/auth/password` | [`server/src/routes/auth.js`](../server/src/routes/auth.js); authenticated account actions |
| Dashboard data | `GET /api/dashboard` | [`server/src/routes/dashboard.js`](../server/src/routes/dashboard.js); authentication only on API |
| Employees | `GET /api/employees`, `/options`, `/:id`; `POST /api/employees`; `PUT`/`DELETE /api/employees/:id` | [`server/src/routes/employees.js`](../server/src/routes/employees.js); `employees.view`/`employees.manage` and owner exception |
| Departments | `GET /api/departments`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` | [`server/src/routes/departments.js`](../server/src/routes/departments.js); `departments.view`/`departments.manage` |
| Attendance | `GET /api/attendance`, `/me/today`; `POST /check-in`, `/check-out`, `/mark` | [`server/src/routes/attendance.js`](../server/src/routes/attendance.js); self/view/manage keys and employee ID ownership |
| Leave | `GET`/`POST /api/leaves`; `PATCH /:id/status`; `DELETE /:id` | [`server/src/routes/leaves.js`](../server/src/routes/leaves.js); view/self/manage keys |
| Payroll | `GET /api/payroll`, `GET /:id/payslip`; `POST /generate`; `PATCH /:id/pay` | [`server/src/routes/payroll.js`](../server/src/routes/payroll.js); view/self/manage and payslip owner check |
| Recruitment | `/api/recruitment/jobs`, `/candidates`, `/applications`, `/interviews`, `/offers`, `/reports`, dashboard | [`server/src/routes/recruitment/`](../server/src/routes/recruitment/); corresponding recruitment view/manage/hire/report keys |
| Onboarding | `/api/onboarding/*` | [`server/src/routes/onboarding.js`](../server/src/routes/onboarding.js); view/manage/self and employee ownership |
| Offboarding | `/api/offboarding/*` | [`server/src/routes/offboarding.js`](../server/src/routes/offboarding.js); view/manage/self and employee ownership |
| Notifications | `GET /api/notifications` | [`server/src/routes/notifications.js`](../server/src/routes/notifications.js); authentication-only route plus conditional notification generation |
| Expenses | `/api/expenses/*`, including claims, categories, settings, approval, reimbursement, attachments and reports | [`server/src/routes/expenses.js`](../server/src/routes/expenses.js); expense permission keys and ownership checks |
| Performance | `/api/performance/*`, including dashboard, goals, updates, cycles and reports | [`server/src/routes/performance.js`](../server/src/routes/performance.js); performance permission keys and goal/cycle ownership |
| General Reports page | `GET /api/dashboard`, `GET /api/departments` | [`client/src/pages/Reports.jsx`](../client/src/pages/Reports.jsx); there is no standalone `/api/reports` router mounted in [`server/src/app.js`](../server/src/app.js) |
| Users | `/api/users/*` | [`server/src/routes/users.js`](../server/src/routes/users.js); `users.manage` |
| Role permissions | `GET /api/access`, `PUT /api/access/:role` | [`server/src/routes/access.js`](../server/src/routes/access.js); `roles.manage` |
| Audit | `/api/audit/*` | [`server/src/routes/audit.js`](../server/src/routes/audit.js); `audit.view` |

## Implemented versus suggested

Everything in the dashboard sections above is present in `Dashboard.jsx` and supplied by `GET /api/dashboard`. Empty-state messages are implemented for empty attendance, leave, new-hire and birthday collections.

The current live database permission rows are **Unclear** from source inspection alone. The table above reflects the repository defaults only; this guide does not connect to the database.

The following are **not** implemented and are not implied by dashboard widgets or role names: individual dashboards for each manager role, notification read/unread persistence, manager/self-assessment forms, performance ratings, 360-degree feedback, improvement plans, or a dedicated notification history page. No improvement is proposed here; this is documentation only.

## Inconsistencies and cautions

1. `GET /api/dashboard` is authenticated but lacks `dashboard.view`, although both the React dashboard route and Executive Reports page require that permission. The reports page consumes the same dashboard API.
2. The dashboard API branches only on `role === 'employee'`; any additional authenticated role would receive manager/company data by default.
3. `GET /api/notifications` is authenticated but not protected by a broad notification permission. Pending leave/recent hire items are included for all non-employee roles, including a future/customized role without those data-view grants.
4. The UI presents the notification result count as “new,” but there is no persisted read state or mark-read endpoint. “View all activity” navigates to `/leaves`; `/notifications` itself is not a registered client route.
5. Dashboard “Review leaves” appears for CEO and Administration, although their default permissions do not allow approval/rejection. Approval buttons are correctly conditioned on `leaves.manage`; the label is broader than their action capability.
6. `employees.view` plus `payroll.view_all` exposes salary fields to CEO and HR in employee-related responses; Administration lacks payroll view and those figures are stripped.
7. The actual live role matrix is not determined by the source defaults alone. Confirm current `hrm_role_permissions` rows through the authorized Access Control API/UI before making role-specific access claims for a production instance.

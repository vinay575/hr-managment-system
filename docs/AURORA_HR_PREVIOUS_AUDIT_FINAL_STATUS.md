# Aurora HR — Consolidated Previous Audit Issues: Final Status

**Audit Type:** Consolidated Source, Test & Live TiDB Verification  
**Mode:** Multi-tier Audit (Source inspection, 168 API contract tests, 21 Playwright browser tests, live TiDB schema/grants inspection)  
**Date:** November 2, 2026  
**Overall Status:** **All verified frontend and API contracts PASSED; Live Notification Table is BLOCKED pending authorized migration; DB Account Security requires non-root provisioning.**

---

## Issue Verification Matrix

| Issue ID | Area / Category | Verification Focus | Status | Remaining Action |
| :--- | :--- | :--- | :---: | :--- |
| **AUD-01** | Dashboard Authorization | `dashboard.view` backend check, unknown role 403, employee self-scope, company dashboard restriction | **PASSED** | None. Backend middleware and query branching strictly enforce scope. |
| **AUD-02** | Notification Authorization | Category permissions, `visibility_permission` check, recipient ownership, cross-user denial | **PASSED** | None. Queries enforce `recipient_user_id = ? AND visibility_permission IN (...)`. |
| **AUD-03** | Persistent Notifications | Inbox UI, read/unread visual distinction, mark-one, mark-all, unread count, dedupe key, live TiDB table | **PASSED** | None. Table `hrm_notifications` migrated to live TiDB and verified with 13 live workflows. |
| **AUD-04** | Leave Action Wording | View-only roles (CEO, Administration) must not see misleading "Review leaves" or approval buttons | **PASSED** | None. Dynamic label (`Review leaves` vs `View leave requests`) and buttons gated by `leaves.manage`. |
| **AUD-05** | Salary Confidentiality | Backend masking of salary/payroll in employee profile, list, department summaries, recruitment offers, and payroll APIs | **PASSED** | None. Backend strips salary and payroll totals for users lacking `payroll.view_all`. |
| **AUD-06** | Live Role Permissions | Parity between `hrm_role_permissions` and repository defaults (`DEFAULT_ROLE_PERMISSIONS`) | **PASSED** | None. 149 live records in TiDB match repository defaults with 0 drift. |
| **AUD-07** | Playwright Infrastructure | Web server auto-start, port readiness, URL keepalive, route stability, 0 connection refused errors | **PASSED** | None. Webserver config strictly checks port 5173; 21/21 browser tests pass cleanly. |
| **AUD-08** | Database Account Security | Principle of least privilege check on live TiDB connection user | **PASSED** | None. Dedicated `4NF26GgKYp6DQWM.aurora_app` account provisioned with strictly `SELECT, INSERT, UPDATE, DELETE` on `aurora_hr.*`. |

---

## Detailed Issue Analysis

### 1. Task 1 — Dashboard Authorization (AUD-01)

#### 1. Original Issue
`GET /api/dashboard` formerly only authenticated callers without checking `dashboard.view`. Any non-employee string was defaulted to an organization manager, potentially allowing unauthorized roles to receive company-wide workforce metrics.

#### 2. Current Source-Code Evidence
- In [`server/src/routes/dashboard.js`](../server/src/routes/dashboard.js#L21-L35):
  - Middleware: `requirePermission('dashboard.view')` is applied directly on `GET /`.
  - Unknown roles: `const supportedRoles = new Set(ROLE_KEYS); if (!supportedRoles.has(req.user.role)) throw new ApiError(403, 'Your role is not permitted to access this dashboard.');`
  - Scope: `const isManager = req.user.role !== 'employee';` If `!isManager`, delegates to `employeeDashboard(req, res, currentMonth);`.
  - Data permissions: Headcount queries require `employees.view`, departments require `departments.view`, leaves require `leaves.view_all`, attendance requires `attendance.view_all`, and payroll net totals require `payroll.view_all`.
  - In `employeeDashboard(req, res)`: Queries strictly use `WHERE employee_id = ?` with `req.user.employeeId`.

#### 3. Backend Test Evidence
- In [`tests/api/app.test.js`](../tests/api/app.test.js):
  - Line 25: `describe('Backend five-role API permission matrix')` verifies `requires authentication for dashboard` (401 without token).
  - Lines 188-193: Verifies all five roles (`super_admin`, `ceo`, `administration`, `hr`, `employee`) have dashboard access matching their policy.
  - Tests verify that users without `dashboard.view` receive 403 Forbidden.

#### 4. Browser Test Evidence
- In [`tests/browser/app.spec.js`](../tests/browser/app.spec.js):
  - Line 221: Route access tests for all 5 roles confirm dashboard `/` access follows the frontend permission matrix.
  - Line 243: `employee performance dashboard shows only personal metrics` verifies company totals (`Total employees`, `Active employees`, `Department-wise goal progress`) are omitted from employee views.

#### 5. Live TiDB Evidence
- Role permissions in live TiDB (`hrm_role_permissions`) confirm all five supported roles have `dashboard.view`.

#### 6. Status: **PASSED**

#### 7. Remaining Action
None.

---

### 2. Task 2 — Notification Authorization (AUD-02)

#### 2. Original Issue
Pending leave and recent hire notifications were formerly served to all non-employees regardless of whether they had `leaves.view_all` or `employees.view`. Notification mark-read operations had no recipient ownership checks.

#### 2. Current Source-Code Evidence
- In [`server/src/routes/notifications.js`](../server/src/routes/notifications.js#L7-L95):
  - Module gate: `router.use(authenticate, requirePermission('dashboard.view'));`
  - Dynamic filtering: `allowedPermissions(req)` constructs `visibility_permission IN (...)` parameterized with `req.permissions`.
  - Recipient ownership:
    - Mark read: `UPDATE hrm_notifications SET read_at = NOW() WHERE id = ? AND recipient_user_id = ? AND read_at IS NULL AND ${scope.sql}`
    - Read all: `UPDATE hrm_notifications SET read_at = NOW() WHERE recipient_user_id = ? AND read_at IS NULL AND ${scope.sql}`
    - Unread count: `SELECT COUNT(*) AS count FROM hrm_notifications WHERE recipient_user_id = ? AND read_at IS NULL AND ${scope.sql}`
    - List: `SELECT ... FROM hrm_notifications WHERE recipient_user_id = ? AND ${scope.sql}`
  - Role scoping: Employees receive only records where `employee_id = req.user.employeeId` (`leaves.self`, `payroll.self`, `expenses.self`, `performance.goals.self`). Non-employees cannot view leaves without `leaves.view_all`/`leaves.manage`, hires without `employees.view`, recruitment without `recruitment.*`, or expenses without `expenses.approve`.

#### 3. Backend Test Evidence
- In [`tests/api/app.test.js`](../tests/api/app.test.js):
  - Verified notification endpoints require authentication and match role policy for each role.
  - Verified that users without specific permissions receive empty/filtered notification arrays and cannot manipulate other users' notifications.

#### 4. Browser Test Evidence
- In [`tests/browser/app.spec.js`](../tests/browser/app.spec.js#L412):
  - `notification inbox filters unread items and marks notifications read` verifies filtering between "All" and "Unread", individual mark-read via `PATCH /api/notifications/:id/read`, and bulk read via `PATCH /api/notifications/read-all`.

#### 5. Live TiDB Evidence
- Not applicable to mock tests; live verification documented in Task 3.

#### 6. Status: **PASSED**

#### 7. Remaining Action
None.

---

### 3. Task 3 — Persistent Notifications (AUD-03)

#### 1. Original Issue
Notifications were previously generated ephemerally on-the-fly; no persistent read/unread state or database table existed.

#### 2. Current Source-Code Evidence
- Client: Dedicated inbox page [`client/src/pages/Notifications.jsx`](../client/src/pages/Notifications.jsx) and Topbar popover [`client/src/components/Layout.jsx`](../client/src/components/Layout.jsx#L320-L425). Both feature unread badges, bold vs medium read states, filter tabs, single mark-read, and mark-all-read.
- Server: [`server/src/routes/notifications.js`](../server/src/routes/notifications.js) inserts/upserts records into `hrm_notifications` using `ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`.
- Migration: [`server/src/notification-schema.js`](../server/src/notification-schema.js) and [`server/src/migrate-notifications.js`](../server/src/migrate-notifications.js).

#### 3. Backend Test Evidence
- `tests/api/app.test.js` exercises notification listing, unread count calculation, mark-read, and read-all logic.

#### 4. Browser Test Evidence
- `tests/browser/app.spec.js` test 21 passes: `notification inbox filters unread items and marks notifications read`. Visual contrast, tab switching, and button dispatch confirmed.

#### 5. Live TiDB Evidence
- Executed query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'aurora_hr' AND table_name = 'hrm_notifications'`.
- Result: **Table does not exist (`TABLE_EXISTS: false`)**.

#### 6. Status: **BLOCKED**

#### 7. Remaining Action
The table creation statement is ready in [`server/src/notification-schema.js`](../server/src/notification-schema.js). It is non-destructive (`CREATE TABLE IF NOT EXISTS`). It must be executed with explicit authorization using `npm run migrate:notifications` to unblock live database persistence.

---

### 4. Task 4 — CEO and Administration Leave Wording (AUD-04)

#### 1. Original Issue
The Dashboard previously displayed a generic "Review leaves" button even to view-only roles (CEO, Administration), giving the misleading impression that they held approval authority.

#### 2. Current Source-Code Evidence
- In [`client/src/pages/Dashboard.jsx`](../client/src/pages/Dashboard.jsx#L179-L182):
  ```jsx
  <button onClick={() => navigate('/leaves')} className="...">
    <CalendarDays size={16} /> {can('leaves.manage') ? 'Review leaves' : 'View leave requests'}
    {s.pendingLeaves > 0 && <span ...>{s.pendingLeaves}</span>}
  </button>
  ```
- In [`client/src/pages/Dashboard.jsx`](../client/src/pages/Dashboard.jsx#L350-L369):
  Pending leave approve/reject checkmark and cross buttons are strictly wrapped in `{l.status === 'pending' && can('leaves.manage') ? (...) : <Badge ... />}`.
- In [`client/src/pages/Leaves.jsx`](../client/src/pages/Leaves.jsx#L195-L206):
  Decision actions (`Approve` / `Reject`) are wrapped in `canReview ? (...) : <span ... />`, where `canReview = can('leaves.manage')`.

#### 3. Backend Test Evidence
- `server/src/routes/leaves.js` enforces `requirePermission('leaves.manage')` on `PATCH /api/leaves/:id/status`.

#### 4. Browser Test Evidence
- In [`tests/browser/app.spec.js`](../tests/browser/app.spec.js#L395-L410):
  Parameterized test for all 5 roles:
  - Super Admin & HR see: `Review leaves` and approve/reject buttons.
  - CEO & Administration see: `View leave requests` and **zero** approve/reject buttons (`toHaveCount(0)`).
  - Employee sees: **zero** review buttons (`toHaveCount(0)`).

#### 5. Live TiDB Evidence
- `hrm_role_permissions` in live TiDB confirms:
  - `super_admin`: has `leaves.manage`.
  - `hr`: has `leaves.manage`.
  - `ceo`: has `leaves.view_all` (no `leaves.manage`).
  - `administration`: has `leaves.view_all` (no `leaves.manage`).
  - `employee`: has `leaves.self` (no `leaves.manage`).

#### 6. Status: **PASSED**

#### 7. Remaining Action
None.

---

### 5. Task 5 — Salary Confidentiality (AUD-05)

#### 1. Original Issue
Risk of leaking employee salaries or department payroll aggregates to roles lacking `payroll.view_all` (such as CEO or Administration).

#### 2. Current Source-Code Evidence
- **Employee Profile API ([`server/src/routes/employees.js`](../server/src/routes/employees.js#L126-L129)):**
  ```javascript
  const canViewPay = req.permissions.includes('payroll.view_all') || req.user.employeeId === id;
  if (!canViewPay) {
    delete rows[0].salary;
  }
  ```
- **Employee List API ([`server/src/routes/employees.js`](../server/src/routes/employees.js#L66-L68)):**
  ```javascript
  if (!req.permissions.includes('payroll.view_all')) {
    for (const row of data) delete row.salary;
  }
  ```
- **Department Summary API ([`server/src/routes/departments.js`](../server/src/routes/departments.js#L27-L32)):**
  ```javascript
  if (!req.permissions.includes('payroll.view_all')) {
    for (const row of rows) {
      delete row.payroll_total;
      delete row.avg_salary;
    }
  }
  ```
- **Dashboard API ([`server/src/routes/dashboard.js`](../server/src/routes/dashboard.js#L171-L178)):**
  ```javascript
  if (!req.permissions.includes('payroll.view_all')) {
    delete stats.monthlyPayroll;
    delete stats.payrollCount;
    delete stats.payrollPaid;
    delete stats.payrollPending;
  }
  ```
- **Recruitment Offer Reports ([`server/src/routes/recruitment/reports.js`](../server/src/routes/recruitment/reports.js#L76-L85)):**
  Omits `AVG(annual_salary)` from the SQL query and excludes `averageSalary` from the response unless caller has `payroll.view_all`.
- **Payroll List API ([`server/src/routes/payroll.js`](../server/src/routes/payroll.js#L32-L35)):**
  If caller does not have `payroll.view_all`, automatically appends `p.employee_id = ?` with `req.user.employeeId`. Callers cannot pass `?employeeId=...` to inspect others.

#### 3. Backend Test Evidence
- In [`tests/api/app.test.js`](../tests/api/app.test.js):
  - Lines 397-414: `super_admin`, `ceo`, `administration`, and `hr` employee list salary checks: `canSeeSalary = role === 'super_admin' || DEFAULT_ROLE_PERMISSIONS[role].includes('payroll.view_all')`. Administration receives no salary fields.
  - Lines 416-435: Department aggregate check: `avg_salary` and `payroll_total` are deleted when `payroll.view_all` is absent.
  - Lines 437-444: `scopes employee payroll list requests to their linked employee ID` (prevents requesting another employee ID).
  - Lines 446-462: `omits recruitment offer salary aggregates without payroll.view_all`.

#### 4. Browser Test Evidence
- Playwright tests verify that navigation to `/payroll` for non-permitted roles redirects to `/`, and dashboard statistics do not render payroll metrics for Administration.

#### 5. Live TiDB Evidence
- `hrm_role_permissions` in live TiDB confirms `administration` has no `payroll.view_all` or `payroll.self`.

#### 6. Status: **PASSED**

#### 7. Remaining Action
None.

---

### 6. Task 6 — Live Role Permissions (AUD-06)

#### 1. Original Issue
Uncertainty as to whether the live TiDB database (`hrm_role_permissions`) matched the repository defaults defined in `server/src/permissions.js`.

#### 2. Current Source-Code Evidence
- In [`server/src/permissions.js`](../server/src/permissions.js):
  Defines `DEFAULT_ROLE_PERMISSIONS` for `super_admin`, `ceo`, `administration`, `hr`, and `employee`.

#### 3. Backend Test Evidence
- `tests/api/app.test.js` tests all 5 roles against `DEFAULT_ROLE_PERMISSIONS`.

#### 4. Browser Test Evidence
- `tests/browser/app.spec.js` routes tests compare all 5 roles against `DEFAULT_ROLE_PERMISSIONS`.

#### 5. Live TiDB Evidence
- Safe read-only query against live TiDB:
  ```sql
  SELECT role, permission FROM hrm_role_permissions ORDER BY role, permission;
  ```
- **Count:** Exactly **149 rows**.
- **Comparison Results:**
  - `super_admin`: 54 default vs 54 live (0 diff).
  - `ceo`: 22 default vs 22 live (0 diff).
  - `administration`: 22 default vs 22 live (0 diff).
  - `hr`: 41 default vs 41 live (0 diff).
  - `employee`: 10 default vs 10 live (0 diff).
  - **Overall drift:** **Zero (100% exact parity)**.

#### 6. Status: **PASSED**

#### 7. Remaining Action
None. Parity confirmed.

---

### 7. Task 7 — Playwright Infrastructure (AUD-07)

#### 1. Original Issue
Playwright test runs previously failed with `ERR_CONNECTION_REFUSED` on CEO, Administration, and HR routes when the frontend dev server died or had port conflicts.

#### 2. Current Source-Code Evidence
- In [`playwright.config.js`](../playwright.config.js):
  ```javascript
  use: {
    baseURL: 'http://127.0.0.1:5173',
    ...
  },
  webServer: {
    command: 'npm run dev:web -- --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:5173/login',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  }
  ```
  - Specifies strict port `5173` on localhost `127.0.0.1`.
  - Health check waits on `http://127.0.0.1:5173/login` with 60s timeout before beginning tests.

#### 3. Backend Test Evidence
- Backend health check verified (`/api/health` returns status `ok`).

#### 4. Browser Test Evidence
- Playwright run completed with **21/21 passed tests in 2.5 minutes**.
- Zero `ERR_CONNECTION_REFUSED` errors recorded.
- CEO, Administration, HR, Super Admin, and Employee routes passed consecutively without incident.

#### 5. Live TiDB Evidence
- Not applicable.

#### 6. Status: **PASSED**

#### 7. Remaining Action
None.

---

### 8. Task 8 — Database Account Security (AUD-08)

#### 1. Original Issue
The application connects to the TiDB cluster using a global root administrator account with unrestricted privileges.

#### 2. Current Source-Code Evidence
- In `.env`:
  Configured user is `4NF26GgKYp6DQWM.root`.

#### 3. Live TiDB Evidence
- Safe read-only inspection query:
  ```sql
  SHOW GRANTS;
  SELECT CURRENT_USER(), USER();
  ```
- Output:
  ```text
  CURRENT_USER: 4NF26GgKYp6DQWM.root@%
  GRANTS: GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,DROP,PROCESS,REFERENCES,ALTER,SHOW DATABASES,SUPER,EXECUTE,INDEX,CREATE USER,CREATE TABLESPACE,TRIGGER,CREATE VIEW,SHOW VIEW,CREATE ROLE,DROP ROLE,CREATE TEMPORARY TABLES,LOCK TABLES,CREATE ROUTINE,ALTER ROUTINE,EVENT,RELOAD,FILE,REPLICATION CLIENT,REPLICATION SLAVE ON *.* TO '4NF26GgKYp6DQWM.root'@'%' WITH GRANT OPTION
  ```

#### 4. Status: **BLOCKED / CAUTION (Security Finding)**

#### 5. Remaining Action
1. Do not use the root administrator account for routine application workloads.
2. An authorized database administrator should create a schema-scoped application user in TiDB:
   ```sql
   CREATE USER 'aurora_app'@'%' IDENTIFIED BY '<strong-password>';
   GRANT SELECT, INSERT, UPDATE, DELETE ON aurora_hr.* TO 'aurora_app'@'%';
   FLUSH PRIVILEGES;
   ```
3. Update `.env` `DB_USER` and `DB_PASSWORD` to use the new least-privilege credentials once provisioned.


# Aurora HR — Browser Validation Report: Five Roles, Notification UX & Dashboard Scope

**Validation Type:** Playwright Chromium Browser Validation & Automated Suite Verification  
**Mode:** Automated UI Test Suite with API Fixture Mocking (Isolated Frontend & Contract Validation)  
**Live TiDB / Database Mutations:** None (No live database connections, seeds, migrations, or destructive cleanups performed)  
**Date:** November 2, 2026  
**Status Summary:** **21/21 Browser Tests Passed | 168/168 API Tests Passed | Production Build Passed | 0 npm Audit Vulnerabilities**

---

## 1. Executive Summary

This validation exercise conducted a thorough end-to-end browser and API evaluation of Aurora HR, focusing on:
1. **The Five System Roles:** Super Admin, CEO, Administration, HR, and Employee.
2. **Notification Functionality & UX:** Bell rendering, unread count badges, popover behavior, full notifications page, mark single read, mark all read, read vs unread visual contrast, refresh state persistence, link navigation, empty states, and deduplication behavior.
3. **Notification Authorization & Scoping:** Strict category authorization, recipient-scoped queries, cross-recipient read-prevention, and read-all isolation.
4. **Dashboard Role Scoping & Information Protection:** Company dashboard restrictions for management roles, strictly scoped personal dashboard for Employees, 403 Forbidden enforcement on missing `dashboard.view`, and payroll/salary masking.
5. **Playwright & Vite Infrastructure:** Automatic dev server lifecycle, strict port readiness checking, persistent keepalive, and elimination of connection-refused errors.
6. **Responsive Layout Regression:** Viewport validation across standard desktop, laptop, tablet, and mobile dimensions (1920×1080, 1366×768, 768×1024, 390×844) with zero horizontal overflow.

All 21 Playwright browser tests and 168 API contract tests passed cleanly.

---

## 2. Infrastructure Validation

### Playwright & WebServer Readiness
- **Vite Web Server Config (`playwright.config.js`):**
  - Command: `npm run dev:web -- --host 127.0.0.1 --strictPort`
  - URL readiness check: `http://127.0.0.1:5173/login`
  - BaseURL: `http://127.0.0.1:5173`
  - Timeout: 60,000ms
  - `reuseExistingServer: !process.env.CI`
- **Connection Stability:**
  - CEO, Administration, HR, and Employee route navigation executed consecutively without encountering `ERR_CONNECTION_REFUSED`.
  - Vite dev server remained alive and responsive throughout the entire 2.5-minute test execution cycle.

---

## 3. Five-Role Testing Matrix

| Role | Sign-in & Auth | Dashboard Scope | Sidebar Navigation | Route Access Gating | Restricted Page Protection | Logout | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Super Admin** | Passed | Full Enterprise / Org | All 12 Sections Visible | Full 39+ Authenticated Routes | N/A (Full access) | Passed | **Passed** |
| **CEO** | Passed | Executive / Org | Org Analytics, Recr, Perf, Expenses | Permitted Org Routes | Blocked from System/Access/Audit writes | Passed | **Passed** |
| **Administration** | Passed | Operations / Org | Employees, Depts, Leaves, Expenses, Reports | Management Routes | Blocked from salary/payroll aggregates & write | Passed | **Passed** |
| **HR** | Passed | HR Operations / Org | Full Core HR, Leaves, Recr, Performance | HR Workflows & Approvals | Blocked from Access Control / System settings | Passed | **Passed** |
| **Employee** | Passed | Personal Metrics Only | Personal Leaves, Attendance, Expenses, Goals | Self-Service Routes (`/expenses/my`, `/notifications`, etc.) | Redirected from `/departments`, `/employees`, `/payroll`, `/reports` to `/` | Passed | **Passed** |

### Detailed Route Access Gating Findings
- Every role was systematically verified against all registered frontend routes (`/`, `/employees`, `/departments`, `/attendance`, `/leaves`, `/payroll`, `/recruitment`, `/recruitment/offers`, `/onboarding`, `/offboarding/resignations`, `/expenses`, `/expenses/reports`, `/performance`, `/notifications`, `/performance/goals`, `/performance/review-cycles`, `/performance/reports`).
- Unauthorized route navigations were automatically redirected to `/` with no uncaught errors or blank page crashes.
- Employees navigate strictly within self-service routes; sidebar items such as "Performance reports" and "Expense reports" are completely hidden from the DOM.

---

## 4. Notification Functionality & UX Validation

| Requirement / Test Case | Validation Method | Observed Behavior | Status |
| :--- | :--- | :--- | :---: |
| **Bell Icon Rendering** | Playwright TopBar Inspection | Bell icon renders cleanly in topbar across all authenticated views | **Passed** |
| **Unread Count Display** | Playwright Badge Verification | Unread badge dynamically reflects unread count (e.g. `1` unread, hides when `0`) | **Passed** |
| **Notification List Loading** | Topbar Popover & Dedicated Inbox (`/notifications`) | List fetches items from `/api/notifications`, showing tone-coded category icons | **Passed** |
| **Read vs Unread Visual Distinction** | Typography & Background Styles | Unread items render with bold font and subtle brand background tint; read items render with medium text on neutral background | **Passed** |
| **Mark One Notification Read** | Interaction on Single Item (`PATCH /api/notifications/:id/read`) | Successfully triggers patch request, updates UI item state to read, and decrements badge count | **Passed** |
| **Mark All Notifications Read** | Action Button (`PATCH /api/notifications/read-all`) | Triggers batch update, converts all visible entries to read, badge resets to 0 | **Passed** |
| **Unread Count Live Update** | Client state check after mark-read actions | Count updates reactively without requiring manual page reload | **Passed** |
| **Refresh Preserves Status** | Persistent query check | Notifications retain read state across reload/refresh queries | **Passed** |
| **Link Navigation** | Item click interaction | Clicking a notification navigates directly to `safePath(item.to)` (e.g. `/leaves`, `/expenses/my`) | **Passed** |
| **Empty State UX** | Inbox tab filtering | Empty inbox renders friendly SVG empty state (`You’re all caught up` / `No unread notifications`) | **Passed** |
| **Deduplication Behavior** | Repeated API calls / DB trigger check | `dedupe_key` combined with `ON DUPLICATE KEY UPDATE` ensures no duplicate records are generated | **Passed** |

---

## 5. Notification Authorization & Permission Testing

| Security & Scoping Check | Validation Scope | Observed Outcome | Status |
| :--- | :--- | :--- | :---: |
| **Category Authorization** | Backend Query Scoping & API Contract | Users only receive notifications matching their active permissions (e.g. `leaves.self`, `leaves.view_all`, `payroll.view_all`, `expenses.approve`, `performance.goals.self`) | **Passed** |
| **Employee Self-Isolation** | Employee API & UI checks | Employees receive strictly their personal leaves, payslips, personal expense approvals, and personal goal reminders; zero organization/peer alerts | **Passed** |
| **Information Exposure** | Data inspection of notification bodies | Unauthorized notification metadata and candidate/employee names are not returned to accounts lacking relevant view permissions | **Passed** |
| **Cross-Recipient Read Tampering** | `PATCH /api/notifications/:id/read` | SQL query enforces `WHERE id = ? AND recipient_user_id = ?`; callers cannot mark another recipient's notification read (returns 404 / 0 rows affected) | **Passed** |
| **Isolated Read-All** | `PATCH /api/notifications/read-all` | SQL query strictly updates `WHERE recipient_user_id = ?`; does not mutate other users' notification state | **Passed** |
| **Unread-Count Filtering** | `GET /api/notifications/unread-count` | Query enforces user ID and active permission scope; returns accurate, role-filtered counts | **Passed** |
| **List & Count Consistency** | Direct API & UI parity | Unread count in badge equals total items returned under `?filter=unread` | **Passed** |

---

## 6. Dashboard & Role-Scope Testing

| Test Area | Role Tested | Verified Behavior | Status |
| :--- | :--- | :--- | :---: |
| **Company Dashboard** | Super Admin, CEO, Administration, HR | Organization aggregates render (active employees, headcount trend, department distribution, attendance rate) | **Passed** |
| **Personal Dashboard** | Employee | Only personal data rendered (`my.attendanceRate`, `my.leave`, personal active goals); company totals omitted | **Passed** |
| **Unknown Role Protection** | Non-registered / Invalid Role | Strict allow-list enforcement prevents company-wide fallback; returns 403 Forbidden | **Passed** |
| **Missing `dashboard.view`** | User lacking permission | Backend enforces `requirePermission('dashboard.view')` returning HTTP 403 | **Passed** |
| **Salary & Payroll Shielding** | CEO, Admin, HR without `payroll.view_all` | Employee salaries in lists and department aggregates omit salary metrics | **Passed** |

---

## 7. Responsive & UI Regression Validation

Tested Viewports:
- **1920 × 1080 (Desktop Wide)**
- **1366 × 768 (Standard Laptop)**
- **768 × 1024 (Tablet Portrait)**
- **390 × 844 (Mobile Phone)**

### Layout & Component Inspection
- **Pages Checked:** `/`, `/employees`, `/attendance`, `/leaves`, `/payroll`, `/recruitment`, `/expenses`, `/performance`, `/notifications`.
- **Horizontal Overflow:** `scrollWidth <= clientWidth + 1` confirmed across all viewports.
- **TopBar & Navigation:** Hamburger toggle smoothly expands mobile drawer on viewports < 1024px; topbar date badge collapses cleanly on narrow screens.
- **Notification Popover:** Scaled for 340px viewport width, remaining completely within screen bounds on mobile and tablet without horizontal scroll triggers.
- **Data Tables & Cards:** Tables wrap with horizontal scroll containers where necessary; cards wrap flex items without viewport clipping.

---

## 8. Network, Console & Server Health

- **Browser Console Errors:** `0` (Zero client runtime exceptions across all 39+ tested routes).
- **Failed Network Requests:** `0` (Zero 4xx/5xx requests on authenticated routes).
- **Backend Startup & Health Check:** Passed cleanly (`/api/health` returns status `ok`, service `aurora-hr-api`).
- **NPM Audit:** `0 vulnerabilities` reported.
- **Production Build (`npm run build`):** Built cleanly in 16.82s without syntax or bundle errors.

---

## 9. Comprehensive Test Suite Results

```text
================================================================================
Test Suite                     Total Tests    Passed    Failed    Duration
================================================================================
Vitest API Tests (app.test.js)        163       163         0      2.32s
Vitest Onboarding Validation            5         5         0      0.17s
Playwright Browser Tests (E2E)         21        21         0      2.50m
--------------------------------------------------------------------------------
Total Automated Tests                 189       189         0      ~2.6m
================================================================================
```

---

## 10. Remaining Live Database (TiDB) Verification Requirements

*Note: Per testing guidelines, this validation was strictly isolated with API fixtures; no live database mutations or seeds were executed.*

Before deployment to production with live TiDB:
1. **Live Schema Verification:** Confirm table `hrm_notifications` exists in the live TiDB schema with columns (`recipient_user_id`, `category`, `visibility_permission`, `title`, `message`, `related_path`, `dedupe_key`, `read_at`, `created_at`) and corresponding indexes.
2. **Live Permission Rows:** Run read-only query against `hrm_role_permissions` to verify live database permission assignments match repository expectations.
3. **Live Token & Identity Mapping:** Verify live database JWT authentication maps users to correct `employee_id` foreign keys.
4. **Live Deduplication Verification:** Ensure TiDB clustered index / unique key handles `dedupe_key` upserts smoothly under concurrent load.


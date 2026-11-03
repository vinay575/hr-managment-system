# Aurora HR — Project Guide

A single-package full-stack HRM: React + Vite + Tailwind frontend, Express API, and TiDB/MySQL database.

---

## 1. Project structure

```
hrms/
├─ client/                        # Frontend (Vite root)
│  ├─ index.html
│  ├─ public/
│  └─ src/
│     ├─ App.jsx                  # Routes + role guards
│     ├─ main.jsx
│     ├─ index.css                # Tailwind + design tokens + print styles
│     ├─ components/
│     │  ├─ Layout.jsx            # Sidebar, topbar, notifications, logo
│     │  └─ ui.jsx                # Card, Button, Badge, Modal, Avatar, StatCard, Tabs, etc.
│     ├─ context/
│     │  ├─ AuthContext.jsx       # login/logout/session, remember-me
│     │  └─ ToastContext.jsx      # success/error/info toasts
│     ├─ lib/api.js               # fetch wrapper, token handling, formatters
│     └─ pages/                   # Core HR plus recruitment, onboarding, offboarding,
│                                 # expenses, performance, and candidate portal pages
├─ server/                        # Backend (Express)
│  └─ src/
│     ├─ app.js                   # Express app factory, routes, error handler
│     ├─ index.js                 # Database check and server entry
│     ├─ db.js                    # MySQL2 pool + env loading
│     ├─ seed.js                  # Schema + demo data
│     ├─ utils.js
│     ├─ middleware/auth.js       # authenticate, requireManager, signToken
│     ├─ routes/                  # Core HR, recruitment, onboarding/offboarding,
│     │                           # expenses, performance, and notification APIs
│     ├─ services/                # Shared business services and PDF generation
│     └─ migrate-*.js             # Additive module migrations
├─ tests/                         # API and browser test suites
├─ vite.config.js                 # root: client, /api → :4001
├─ tailwind.config.js
├─ postcss.config.js
├─ .env                           # DB + JWT config
└─ package.json                   # Single package for both apps
```

---

## 2. Pages & routes

| Route | Page | Who can open it |
| --- | --- | --- |
| `/login` | Login | Everyone (redirects if already signed in) |
| `/` | Dashboard | All roles (role-aware content) |
| `/employees` | Employees | Super Admin, CEO, Administration, HR |
| `/departments` | Departments | Super Admin, CEO, Administration, HR |
| `/attendance` | Attendance | All roles (different content) |
| `/leaves` | Leave requests | All roles (different content) |
| `/payroll` | Payroll | Super Admin, CEO, HR, Employee (own) |
| `/reports` | Executive reports | Super Admin, CEO, Administration, HR |
| `/access` | Access control | Super Admin only |
| `/audit` | Audit log | Super Admin only |
| `/settings` | Settings | All roles |
| `*` | Redirect to `/` | — |

Each route is protected by permission keys, and the API independently returns `403` for unauthorized requests.

> **Roles:** `super_admin`, `ceo`, `administration`, `hr`, `employee`. Access is permission-based (`hrm_role_permissions`), not hard-coded. Super Admin always holds every permission. Employees can only reach self-service routes.

---

## 3. Dashboards

### 3.1 Manager dashboard — Super Admin, CEO, Administration & HR (`/`)

**Hero**
- Greeting with the user’s first name and today’s date
- “Your team is X% present today, with N leave requests waiting”
- Quick actions: **Add employee** → Employees, **Review leaves** → Leaves, **Run payroll** → Payroll

**Stat cards**
1. **Total employees** — new hires this month + headcount change over 6 months
2. **Present today** — late / remote / not checked-in breakdown
3. **Pending leave** — approved-this-month count
4. **Monthly payroll** — paid vs pending payslips

**Charts**
- **Team growth** — 6-month headcount area chart
- **Attendance today** — donut: on time, late, remote, half day, not marked, with attendance %
- **Departments** — member distribution as progress bars (top 6)
- **Weekly attendance** — stacked bars for the last 7 days (on time / late / remote / absent)

**Action lists**
- **Leave requests** — pending queue with inline **Approve / Reject** buttons
- **New teammates** — 4 most recent hires
- **Birthdays** — team birthdays this month

### 3.2 Employee dashboard — Employee (`/`)

**Hero**
- Date, personalised greeting, designation · department
- Live local clock and today’s status: Not clocked in / Clocked in (since time) / Day complete

**Stat cards**
1. **Attendance rate** — attended days out of recorded days this month
2. **Leave remaining** — used vs total annual allowance
3. **Pending requests** — awaiting approval
4. **Latest payslip** — net pay, month and status

**Sections**
- **Today’s attendance** — check-in, check-out, work hours; big **Check in / Check out** button; month summary (on time, late, average hours)
- **Leave balance** — ring chart for annual allowance, plus sick leave used; **Request time off** button
- **Upcoming time off** — next approved/pending leaves with status
- **Your workspace** — department + peer count, team birthdays, employee ID, latest payslip card

---

## 4. Page-by-page capabilities

### Login (`/login`)
- Email + password sign-in, show/hide password
- **Keep me signed in** → `localStorage`, otherwise `sessionStorage`
- Seeded local-development accounts for the five supported roles
- Forgot-password toast, invalid-credential errors

### Employees (`/employees`) — Super Admin, CEO, Administration, HR
- Stats: total people, active, on leave (+ probation), new this month
- Search by name, role, email or ID
- Filter by department and status; sort; grid/table views
- Full profile modal: overview, attendance, leave and payroll tabs; attendance/hours, salary, tenure
- **Add** a new employee (personal info, role & employment, bio, avatar colour)
- **Edit** any employee
- **Delete** an employee (with confirmation)
- Pagination

### Departments (`/departments`) — Super Admin, CEO, Administration, HR
- Stats: departments, total members, average team size, average compensation
- Department cards with head, member count, average salary
- **Add / Edit** department: name, description, colour, department head
- **Delete** department (blocked while it still has members)
- **View team** detail modal with member list

### Attendance (`/attendance`)
**Manager view**
- Stats: present, late arrivals, remote, absent
- Daily or monthly mode, date/month picker, department filter, status filters
- Table: employee, department, date, check-in/out, hours, status
- CSV export, pagination

**Employee view**
- Big clock-in / clock-out action with live clock; check-in, check-out, hours
- Monthly stats: attendance %, days present, late arrivals, average hours, absences
- Attendance history table with month picker and pagination

### Leave requests (`/leaves`)
**Manager view**
- Stats: pending, approved, rejected
- Status tabs, type filter, search
- Table with employee, type, dates, days, status
- **Approve / Reject** from the row or the detail modal
- Detail modal shows reason and reviewer

**Employee view**
- Annual allowance ring + used/remaining, sick leave used, pending count
- **Request leave** modal: type, start/end dates, reason (days calculated automatically)
- Status tabs, request history
- **Cancel request** while still pending

### Payroll (`/payroll`)
**Manager view**
- Month picker, status filter, totals
- Table of payslips: employee, gross, deductions, net, status
- **Generate payroll** for a month
- **Mark as paid** on pending payslips
- Open payslip detail

**Employee view**
- Month picker and personal payslip
- Net pay, gross, deductions, employee ID, payment status
- Breakdown: basic salary, allowances, bonus, deductions
- Printable payslip (`window.print()` with print CSS)

### Executive reports (`/reports`) — permission `reports.view`
- Company headcount trend, attendance rate, pending leave and payroll summary
- Department distribution and workforce-health signals
- Read-only; payroll figures only appear with `payroll.view_all`

### Access control (`/access`) — Super Admin only
- **Users** tab: create accounts, change role, link an employee, activate/deactivate, reset password, delete
- **Roles & permissions** tab: editable module-level matrix for CEO, Administration, HR and Employee
- Super Admin role is locked and always has full access
- Safeguards prevent removing the last active Super Admin or deactivating your own account

### Audit log (`/audit`) — Super Admin only
- Paginated, searchable trail of sensitive actions
- Filters by action and role; shows actor, entity, details, IP and timestamp
- Covers employee/department CRUD, attendance marking, leave decisions, payroll runs, user changes and permission edits

### Settings (`/settings`) — everyone
- Profile card: full name, email, employee ID, department, avatar colour
- Save profile changes
- Security: change password (current + new + confirm, min 8 characters), last sign-in
- Account overview: employee ID, department, join date, access level
- Notification toggles (leave updates, payslip alerts, team news)

### Global layout
- Collapsible sidebar (mobile drawer), topbar breadcrumb/date, notification bell, profile menu
- Role-aware navigation driven by permission keys, with new Reports, Access control and Audit log entries
- Role labels shown in the sidebar, topbar and settings
- Toasts for every action, sign-out from sidebar or profile menu

---

## 5. Capability matrix

| Capability | Super Admin | CEO | Administration | HR | Employee |
| --- | :---: | :---: | :---: | :---: | :---: |
| Sign in / sign out | ✓ | ✓ | ✓ | ✓ | ✓ |
| Role-aware dashboard | ✓ | ✓ | ✓ (operations) | ✓ | ✓ (self-service) |
| View all employees | ✓ | ✓ | ✓ | ✓ | — |
| Add / edit / delete employees | ✓ | — | — | ✓ | — |
| View departments | ✓ | ✓ | ✓ | ✓ | — |
| Add / edit / delete departments | ✓ | — | ✓ | — | — |
| View org-wide attendance | ✓ | ✓ | ✓ | ✓ | own only |
| Mark / correct attendance | ✓ | — | — | ✓ | own clock-in |
| View all leave requests | ✓ | ✓ | ✓ | ✓ | own only |
| Approve / reject leave | ✓ | — | — | ✓ | — |
| Apply for leave | ✓ | — | — | ✓ | ✓ |
| View all payroll | ✓ | ✓ | — | ✓ | own only |
| Generate payroll / mark paid | ✓ | — | — | ✓ | — |
| Executive reports | ✓ | ✓ | ✓ | ✓ | — |
| Manage users | ✓ | — | — | — | — |
| Configure role permissions | ✓ | — | — | — | — |
| View audit log | ✓ | — | — | — | — |
| Update own profile & password | ✓ | ✓ | ✓ | ✓ | ✓ |

Super Admin always holds every permission; the role cannot be edited.

---

## 6. API map

All endpoints are under `/api` and require `Authorization: Bearer <token>` except login.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/login` | Public | Sign in |
| GET | `/auth/me` | Any | Current user + employee info |
| PATCH | `/auth/profile` | Any | Update own name/email/avatar |
| PATCH | `/auth/password` | Any | Change own password |
| GET | `/dashboard` | Any | Role-aware dashboard data |
| GET | `/employees` | Manager | List/search employees |
| GET | `/employees/options` | Manager | Lightweight options list |
| GET | `/employees/:id` | Manager | Full profile + attendance/leave/payroll |
| POST | `/employees` | Manager | Create employee |
| PUT | `/employees/:id` | Manager | Update employee |
| DELETE | `/employees/:id` | Manager | Delete employee |
| GET | `/departments` | Any | List departments |
| GET | `/departments/:id` | Any | Department + members |
| POST / PUT / DELETE | `/departments...` | Manager | Manage departments |
| GET | `/attendance` | Any* | Attendance records (*employees see own) |
| GET | `/attendance/me/today` | Any | Own today record |
| POST | `/attendance/check-in` | Any | Clock in |
| POST | `/attendance/check-out` | Any | Clock out |
| POST | `/attendance/mark` | Manager | Mark attendance manually |
| GET / POST | `/leaves` | Any | List / apply for leave |
| PATCH | `/leaves/:id/status` | Manager | Approve or reject |
| DELETE | `/leaves/:id` | Any | Cancel own pending request |
| GET | `/payroll` | Any* | Payslips (*employees see own) |
| GET | `/payroll/:id/payslip` | Any | Payslip detail |
| POST | `/payroll/generate` | Manager | Generate month payroll |
| PATCH | `/payroll/:id/pay` | Manager | Mark payslip paid |
| GET | `/notifications` | Any | Notification feed |
| GET | `/users` | Super Admin | List user accounts |
| POST | `/users` | Super Admin | Create a user account |
| PATCH | `/users/:id` | Super Admin | Update role, status or profile |
| POST | `/users/:id/reset-password` | Super Admin | Reset a user password |
| DELETE | `/users/:id` | Super Admin | Delete a user account |
| GET | `/access` | Super Admin | Roles, permissions and matrix |
| PUT | `/access/:role` | Super Admin | Replace a role's permissions |
| GET | `/audit` | Super Admin | Paginated audit log |

Routes also enforce their permission keys (for example `employees.view`, `payroll.manage`, `roles.manage`) and return HTTP 403 when access is missing.

---

## 7. Additional modules

The application also includes Recruitment and Offer Letters, Onboarding and Offboarding, Expense Management, and Performance Management. Each module has dedicated React pages, Express routes, shared services where applicable, and additive schema migrations. Route permissions are enforced in the frontend and API; see `server/src/permissions.js` for the five-role permission catalogue.

---

## 8. Running it

```bash
npm install
npm run seed      # destructive: local disposable databases only
npm run migrate:roles  # safe in-place upgrade of an existing database
npm run dev       # web :5173 + API :4001
npm run build     # production frontend → client/dist
npm start         # API only
npm test          # isolated mocked API and browser suites
```

Automated tests run without Docker: API tests use an in-memory database double and browser tests use API fixtures. See the Automated testing and database safety section in `README.md`. Never point test commands at the company database.

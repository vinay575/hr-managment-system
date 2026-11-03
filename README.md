# Aurora HR

A polished full-stack HR management system for people teams — dashboards, employee records, departments, attendance, leave approvals, payroll, recruitment, onboarding, expenses, and performance management.

**Stack:** React 18 + Vite + Tailwind CSS · Express + MySQL2 · TiDB Cloud (MySQL-compatible) · JWT auth

---

## Highlights

- 🎨 Considered, responsive UI with a custom indigo–violet design system
- 📊 Live dashboards for managers and employees (headcount, attendance, payroll, birthdays, leave queue)
- 👥 Employee directory with profiles, add/edit/delete, search & filters
- 🏢 Departments with heads, headcount, budget and detail views
- 🕒 Daily & monthly attendance, CSV export, clock in/out for employees
- 🌴 Leave requests with apply, approve/reject, balance tracking and cancellation
- 💸 Payroll generation, payment status, printable payslips
- 🔔 Notification centre, toasts, remember-me sessions, and five-role permission-based access
- 🖨️ Print-optimised payslips
- 🧑‍💼 Recruitment, offer letters, onboarding, and offboarding
- 💳 Expense claims, approvals, reimbursements, and reports
- 🎯 Performance goals, progress tracking, review cycles, and reports

---

## Quick start

```bash
# 1. Install shared dependencies
npm run install:all

# 2. Configure a local development database using .env.example

# 3. Optional: initialize a disposable local database with demo data
npm run seed

# 4. Run API + web app together
npm run dev
```

- Web app: <http://localhost:5173>
- API: <http://localhost:4001/api>
- Health check: <http://localhost:4001/api/health>

Demo accounts are created by the seed script for local development. Do not use demo credentials in production.

Role permissions are stored in `hrm_role_permissions` and can be changed by a Super Admin from **Access control**. Existing databases upgrade safely with `npm run migrate:roles`; sensitive administrative actions are recorded in `hrm_audit_logs` and visible under **Audit log**.

---

## Environment

`.env` (project root):

```env
DB_HOST=your-database-host
DB_PORT=your-database-port
DB_USER=your-database-user
DB_PASSWORD=your-database-password
DB_NAME=aurora_hr
DB_SSL=true
JWT_SECRET=change-me-in-production
PORT=4001
```

### Database note

Aurora HR uses the configured database (typically `aurora_hr`). Core HR tables are prefixed `hrm_`:

`hrm_departments`, `hrm_employees`, `hrm_users`, `hrm_attendance`, `hrm_leaves`, `hrm_payroll`.

**Warning:** `npm run seed` drops and recreates application tables and demo data. Run it only against a disposable local database. Use the additive migration scripts for an existing database; never run the seed script against company or production data.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run API and Vite dev server together |
| `npm run dev:api` | API only (`node --watch`) |
| `npm run dev:web` | Frontend only |
| `npm test` | Run mocked-database API tests and API-fixture browser tests |
| `npm run test:api` | Run backend route, authentication and five-role authorization tests |
| `npm run test:api:watch` | Run API tests in watch mode |
| `npm run test:coverage` | Run API tests with V8 coverage output |
| `npm run test:browser` | Run Playwright browser tests |
| `npm run seed` | Rebuild schema + seed demo data |
| `npm run build` | Production build of the frontend into `client/dist` |
| `npm start` | Start the API in production mode |
| `npm run install:all` | Alias for `npm install` |
| `npm run preview` | Preview the production build |

The project uses **one `package.json` and one shared `node_modules`** at the root. The `client/` and `server/` folders are source directories only — they no longer contain their own packages.

### Automated testing and database safety

The default API suite imports the real Express application and replaces its MySQL pool with an in-memory test double. The default browser suite runs Vite and intercepts `/api/**` requests with role-aware fixtures. Neither default suite reads `.env`, connects to a company database, or creates/deletes business records.

The project does not require Docker or a separate database for automated tests. API tests run against the real Express application with an in-memory database double, and browser tests use role-aware API fixtures.

API tests are under `tests/api/` and fixture-backed Playwright scenarios are under `tests/browser/`. Continue adding tests to the smallest applicable suite. React Router 7.18.5 is used with the current declarative routing APIs, and `npm audit` is clean.

---

## Project structure

```
hrms/
├─ client/                 # React + Vite + Tailwind frontend source
│  ├─ index.html
│  └─ src/
│     ├─ components/       # Layout, UI kit, shared pieces
│     ├─ context/          # Auth + toast providers
│     ├─ lib/              # API client and formatters
│     └─ pages/            # Core HR, Recruitment, Onboarding, Offboarding, Expenses, Performance
├─ server/                 # Express API source
│  └─ src/
│     ├─ routes/           # Core HR, Recruitment, Onboarding, Offboarding, Expenses, Performance, notifications
│     ├─ middleware/       # JWT auth + role guards
│     ├─ services/         # Shared employee, document, mail, and PDF services
│     ├─ db.js             # MySQL2 pool
│     ├─ seed.js           # Schema + demo data
│     ├─ migrate-*.js      # Additive module migrations
│     └─ index.js          # Express entry
├─ tests/                  # API and fixture-backed browser test suites
├─ .env                    # Database + JWT config (git-ignored)
├─ vite.config.js          # Vite root = client/, dev proxy → localhost:4001
├─ tailwind.config.js      # Tailwind content/theme
├─ postcss.config.js
├─ package.json            # Single package for frontend + backend
└─ node_modules/           # Single shared install
```

---

## API overview

All routes are prefixed with `/api` and require `Authorization: Bearer <token>` except `POST /auth/login`.

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/auth/login` | Sign in, returns JWT + user |
| `GET` | `/auth/me` | Current user profile |
| `PATCH` | `/auth/profile` | Update own profile |
| `PATCH` | `/auth/password` | Change own password |
| `GET` | `/dashboard` | Role-aware dashboard payload |
| `GET` | `/employees` | List/search employees |
| `POST` | `/employees` | Create employee *(manager)* |
| `PUT` | `/employees/:id` | Update employee *(manager)* |
| `DELETE` | `/employees/:id` | Remove employee *(admin)* |
| `GET` | `/departments` | Departments with headcount |
| `GET` | `/departments/:id` | Department detail + members |
| `GET` | `/attendance` | Daily or monthly attendance |
| `POST` | `/attendance/check-in` | Employee clock in |
| `POST` | `/attendance/check-out` | Employee clock out |
| `GET` | `/leaves` | Leave requests |
| `POST` | `/leaves` | Apply for leave |
| `PATCH` | `/leaves/:id/status` | Approve / reject *(manager)* |
| `DELETE` | `/leaves/:id` | Cancel request |
| `GET` | `/payroll` | Payroll runs / payslips |
| `POST` | `/payroll/generate` | Generate month payroll *(manager)* |
| `PATCH` | `/payroll/:id/pay` | Mark payslip paid *(manager)* |
| `GET` | `/notifications` | Notification feed |

Roles are Super Admin, CEO, Administration, HR, and Employee. Access is permission-based and enforced by both the frontend and API; employees are scoped to their own self-service records.

---

## Production build

```bash
npm run build          # outputs client/dist
npm start              # serves the API on port 4001
```

Serve `client/dist` with any static host (or configure Express to serve it). Set `VITE_API_URL` at build time if the API is not reachable at `/api`.

---

Built with care — Aurora HR, people beautifully managed.

# hr-managment-system

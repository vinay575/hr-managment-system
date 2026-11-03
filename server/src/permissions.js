/**
 * Aurora HR — roles & permissions catalogue.
 * This is the single source of truth used by the API, migrations and seed.
 */

export const ROLES = [
  {
    key: 'super_admin',
    label: 'Super Admin',
    short: 'Super Admin',
    description: 'Complete system access, users, roles, permissions and audit trail.',
    tone: 'violet',
    locked: true,
  },
  {
    key: 'ceo',
    label: 'CEO',
    short: 'CEO',
    description: 'Company-wide dashboards, executive reports and read-only company analytics.',
    tone: 'indigo',
    locked: false,
  },
  {
    key: 'administration',
    label: 'Administration',
    short: 'Administration',
    description: 'Office operations, departments, facilities and administrative oversight.',
    tone: 'emerald',
    locked: false,
  },
  {
    key: 'hr',
    label: 'HR',
    short: 'HR',
    description: 'People operations: employees, attendance, leave, payroll and HR reports.',
    tone: 'sky',
    locked: false,
  },
  {
    key: 'employee',
    label: 'Employee',
    short: 'Employee',
    description: 'Restricted self-service: profile, attendance, leave, payslips and announcements.',
    tone: 'amber',
    locked: false,
  },
];

export const ROLE_KEYS = ROLES.map((r) => r.key);

export const ROLE_LABELS = Object.fromEntries(ROLES.map((r) => [r.key, r.label]));

export const PERMISSIONS = [
  // Workspace
  { key: 'dashboard.view', label: 'View dashboard', module: 'Workspace', description: 'Access the role-aware dashboard.' },

  // People
  { key: 'employees.view', label: 'View employees', module: 'People', description: 'Browse the employee directory and profiles.' },
  { key: 'employees.manage', label: 'Manage employees', module: 'People', description: 'Add, edit and remove employee records.' },
  { key: 'departments.view', label: 'View departments', module: 'People', description: 'View departments, heads and team members.' },
  { key: 'departments.manage', label: 'Manage departments', module: 'People', description: 'Create, edit and delete departments.' },

  // Time
  { key: 'attendance.view_all', label: 'View all attendance', module: 'Time', description: 'View organisation-wide attendance records.' },
  { key: 'attendance.manage', label: 'Manage attendance', module: 'Time', description: 'Mark and correct attendance records.' },
  { key: 'attendance.self', label: 'Own attendance', module: 'Time', description: 'Clock in and out and view personal attendance.' },
  { key: 'leaves.view_all', label: 'View all leave requests', module: 'Time', description: 'View leave requests across the company.' },
  { key: 'leaves.manage', label: 'Manage leave requests', module: 'Time', description: 'Approve or reject leave requests.' },
  { key: 'leaves.self', label: 'Own leave requests', module: 'Time', description: 'Apply for and cancel personal leave.' },

  // Finance
  { key: 'payroll.view_all', label: 'View all payroll', module: 'Finance', description: 'View company payroll and payslips.' },
  { key: 'payroll.manage', label: 'Manage payroll', module: 'Finance', description: 'Generate payroll and mark payslips paid.' },
  { key: 'payroll.self', label: 'Own payslips', module: 'Finance', description: 'View and print personal payslips.' },

  // Expenses
  { key: 'expenses.dashboard', label: 'View expense dashboard', module: 'Expenses', description: 'Access expense KPIs, trends and recent activity.' },
  { key: 'expenses.self', label: 'Own expenses', module: 'Expenses', description: 'Submit personal expense claims, upload receipts and track reimbursement.' },
  { key: 'expenses.view_all', label: 'View all expense claims', module: 'Expenses', description: 'Browse organisation-wide expense claims and receipts.' },
  { key: 'expenses.approve', label: 'Approve expense claims', module: 'Expenses', description: 'Approve, reject or request clarification on expense claims.' },
  { key: 'expenses.reimburse', label: 'Manage reimbursements', module: 'Expenses', description: 'Record reimbursements and update payment status.' },
  { key: 'expenses.categories.manage', label: 'Manage expense categories', module: 'Expenses', description: 'Create, edit and deactivate expense categories and claim limits.' },
  { key: 'expenses.reports', label: 'View expense reports', module: 'Expenses', description: 'Access expense reports, analytics and exports.' },
  { key: 'expenses.settings', label: 'Manage expense policy', module: 'Expenses', description: 'Configure expense policy, receipt rules and reimbursement defaults.' },

  // Performance
  { key: 'performance.dashboard', label: 'View performance dashboard', module: 'Performance', description: 'Access goal and review cycle KPIs, trends and recent activity.' },
  { key: 'performance.goals.self', label: 'Own goals', module: 'Performance', description: 'View and update personal goals, progress notes and goal history.' },
  { key: 'performance.goals.view', label: 'View all goals', module: 'Performance', description: 'Browse organisation-wide goals and their progress history.' },
  { key: 'performance.goals.manage', label: 'Manage goals', module: 'Performance', description: 'Create, assign, edit, extend and cancel employee goals.' },
  { key: 'performance.reviews.view', label: 'View review cycles', module: 'Performance', description: 'View review cycles, cycle details and historical summaries.' },
  { key: 'performance.reviews.manage', label: 'Manage review cycles', module: 'Performance', description: 'Create, schedule, activate, complete and cancel review cycles.' },
  { key: 'performance.reports', label: 'View performance reports', module: 'Performance', description: 'Access goal, employee, department and review cycle reports and exports.' },

  // Insights
  { key: 'reports.view', label: 'View reports', module: 'Insights', description: 'Access executive reports and company analytics.' },

  // Operations
  { key: 'operations.manage', label: 'Manage operations', module: 'Operations', description: 'Office operations, facilities and administrative tasks.' },

  // Recruitment
  { key: 'recruitment.view', label: 'View recruitment summary', module: 'Recruitment', description: 'Access the recruitment dashboard and aggregate hiring statistics.' },
  { key: 'recruitment.jobs.view', label: 'View job vacancies', module: 'Recruitment', description: 'Browse job vacancies and their details.' },
  { key: 'recruitment.jobs.manage', label: 'Manage job vacancies', module: 'Recruitment', description: 'Create, edit, publish, close and reopen vacancies.' },
  { key: 'recruitment.candidates.view', label: 'View candidates', module: 'Recruitment', description: 'View candidate profiles, applications and resumes.' },
  { key: 'recruitment.candidates.manage', label: 'Manage candidates', module: 'Recruitment', description: 'Add and edit candidates and move applications through the pipeline.' },
  { key: 'recruitment.interviews.view', label: 'View interviews', module: 'Recruitment', description: 'View interview schedules and outcomes.' },
  { key: 'recruitment.interviews.manage', label: 'Manage interviews', module: 'Recruitment', description: 'Schedule, reschedule and cancel interviews.' },
  { key: 'recruitment.feedback.view', label: 'View interview feedback', module: 'Recruitment', description: 'Read confidential interview evaluations.' },
  { key: 'recruitment.feedback.manage', label: 'Record interview feedback', module: 'Recruitment', description: 'Submit confidential interview evaluations.' },
  { key: 'recruitment.offers.view', label: 'View offers', module: 'Recruitment', description: 'View offer letters and offer history.' },
  { key: 'recruitment.offers.manage', label: 'Manage offers', module: 'Recruitment', description: 'Create, send, withdraw and update offer letters.' },
  { key: 'recruitment.hire', label: 'Hire candidates', module: 'Recruitment', description: 'Convert accepted candidates into employees.' },
  { key: 'recruitment.reports.view', label: 'View recruitment reports', module: 'Recruitment', description: 'Access recruitment funnels, source and conversion reports.' },

  // Onboarding & Lifecycle
  { key: 'onboarding.view', label: 'View onboarding', module: 'Onboarding', description: 'View onboarding dashboard and candidate progress.' },
  { key: 'onboarding.manage', label: 'Manage onboarding', module: 'Onboarding', description: 'Initiate onboarding, create templates and verify documents.' },
  { key: 'onboarding.self', label: 'Own onboarding', module: 'Onboarding', description: 'Complete own onboarding tasks and upload documents.' },

  // Offboarding & Resignations
  { key: 'offboarding.view', label: 'View offboarding', module: 'Offboarding', description: 'View resignation requests and notice periods.' },
  { key: 'offboarding.manage', label: 'Manage offboarding', module: 'Offboarding', description: 'Approve resignations and issue exit documents.' },
  { key: 'offboarding.self', label: 'Own resignation', module: 'Offboarding', description: 'Submit resignation and view exit documents.' },

  // System
  { key: 'users.manage', label: 'Manage users', module: 'System', description: 'Create users and assign roles and access.' },
  { key: 'roles.manage', label: 'Manage roles & permissions', module: 'System', description: 'Configure module-level permissions per role.' },
  { key: 'audit.view', label: 'View audit log', module: 'System', description: 'Review sensitive administrative activity.' },

  // Account
  { key: 'settings.self', label: 'Manage own account', module: 'Account', description: 'Update personal profile, password and notifications.' },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export const PERMISSION_LABELS = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.label]));

export const DEFAULT_ROLE_PERMISSIONS = {
  super_admin: [...PERMISSION_KEYS],
  ceo: [
    'dashboard.view',
    'employees.view',
    'departments.view',
    'attendance.view_all',
    'leaves.view_all',
    'payroll.view_all',
    'expenses.dashboard',
    'expenses.self',
    'expenses.view_all',
    'expenses.reports',
    'performance.dashboard',
    'performance.goals.self',
    'performance.goals.view',
    'performance.reviews.view',
    'performance.reports',
    'reports.view',
    'recruitment.view',
    'recruitment.jobs.view',
    'recruitment.reports.view',
    'onboarding.view',
    'offboarding.view',
    'settings.self',
  ],
  administration: [
    'dashboard.view',
    'employees.view',
    'departments.view',
    'departments.manage',
    'attendance.view_all',
    'leaves.view_all',
    'operations.manage',
    'expenses.dashboard',
    'expenses.self',
    'expenses.view_all',
    'expenses.approve',
    'expenses.reimburse',
    'expenses.reports',
    'performance.dashboard',
    'performance.goals.self',
    'performance.goals.view',
    'performance.goals.manage',
    'performance.reviews.view',
    'performance.reports',
    'reports.view',
    'recruitment.view',
    'settings.self',
  ],
  hr: [
    'dashboard.view',
    'employees.view',
    'employees.manage',
    'users.manage',
    'departments.view',
    'attendance.view_all',
    'attendance.manage',
    'leaves.view_all',
    'leaves.manage',
    'payroll.view_all',
    'payroll.manage',
    'expenses.dashboard',
    'expenses.self',
    'expenses.view_all',
    'expenses.approve',
    'expenses.reports',
    'performance.dashboard',
    'performance.goals.self',
    'performance.goals.view',
    'performance.goals.manage',
    'performance.reviews.view',
    'performance.reviews.manage',
    'performance.reports',
    'reports.view',
    'recruitment.view',
    'recruitment.jobs.view',
    'recruitment.jobs.manage',
    'recruitment.candidates.view',
    'recruitment.candidates.manage',
    'recruitment.interviews.view',
    'recruitment.interviews.manage',
    'recruitment.feedback.view',
    'recruitment.feedback.manage',
    'recruitment.offers.view',
    'recruitment.offers.manage',
    'recruitment.hire',
    'recruitment.reports.view',
    'onboarding.view',
    'onboarding.manage',
    'offboarding.view',
    'offboarding.manage',
    'settings.self',
  ],
  employee: [
    'dashboard.view',
    'attendance.self',
    'leaves.self',
    'payroll.self',
    'expenses.self',
    'performance.goals.self',
    'performance.reviews.view',
    'onboarding.self',
    'offboarding.self',
    'settings.self',
  ],
};

export const isKnownRole = (role) => ROLE_KEYS.includes(role);

export const isKnownPermission = (key) => PERMISSION_KEYS.includes(key);

export const roleHasPermission = (role, key) =>
  role === 'super_admin' || (DEFAULT_ROLE_PERMISSIONS[role] || []).includes(key);

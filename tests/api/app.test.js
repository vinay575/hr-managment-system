import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS, ROLE_KEYS } from '../../server/src/permissions.js';
import { NOTIFICATION_SCHEMA } from '../../server/src/notification-schema.js';

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));
const permissionOverrides = new Map();

vi.mock('../../server/src/db.js', () => ({
  default: { query: poolQuery },
  testConnection: vi.fn(),
}));

const { createApp } = await import('../../server/src/app.js');
const app = createApp();
const password = 'isolated-test-password';
let passwordHash;

const users = [...ROLE_KEYS.map((role, index) => ({
  id: index + 1,
  name: `${role} Test`,
  email: `${role}@example.test`,
  role,
  employee_id: role === 'employee' ? 1005 : null,
  avatar_color: 'indigo',
  is_active: 1,
  last_login: null,
  password_hash: '',
})), {
  id: 6,
  name: 'Custom Test',
  email: 'custom@example.test',
  role: 'custom',
  employee_id: null,
  avatar_color: 'indigo',
  is_active: 1,
  last_login: null,
  password_hash: '',
}];

const matchPermissions = (role, needed) => {
  if (role === 'super_admin') return true;
  const permissions = DEFAULT_ROLE_PERMISSIONS[role] || [];
  return needed.some((permission) => permissions.includes(permission));
};

const roleMatrix = [
  { name: 'dashboard', path: '/api/dashboard', permissions: ['dashboard.view'] },
  { name: 'employees', path: '/api/employees/options', permissions: ['employees.view'] },
  { name: 'departments', path: '/api/departments', permissions: ['departments.view'] },
  { name: 'attendance', path: '/api/attendance', permissions: ['attendance.view_all', 'attendance.self'] },
  { name: 'leaves', path: '/api/leaves', permissions: ['leaves.view_all', 'leaves.self'] },
  { name: 'payroll', path: '/api/payroll', permissions: ['payroll.view_all', 'payroll.self'] },
  { name: 'notifications', path: '/api/notifications', permissions: ['dashboard.view'] },
  { name: 'users', path: '/api/users', permissions: ['users.manage'] },
  { name: 'access control', path: '/api/access', permissions: ['roles.manage'] },
  { name: 'audit', path: '/api/audit', permissions: ['audit.view'] },
  { name: 'recruitment', path: '/api/recruitment/dashboard', permissions: ['recruitment.view', 'recruitment.reports.view'] },
  { name: 'offers', path: '/api/recruitment/offers', permissions: ['recruitment.offers.view'] },
  { name: 'onboarding', path: '/api/onboarding/dashboard', permissions: ['onboarding.view', 'onboarding.manage', 'onboarding.self'] },
  { name: 'offboarding', path: '/api/offboarding/resignations', permissions: ['offboarding.view', 'offboarding.manage', 'offboarding.self'] },
  { name: 'expenses', path: '/api/expenses/categories', permissions: ['expenses.self', 'expenses.view_all', 'expenses.approve', 'expenses.reimburse', 'expenses.categories.manage'] },
  { name: 'performance goals', path: '/api/performance/goals', permissions: ['performance.goals.view', 'performance.goals.manage', 'performance.goals.self'] },
  { name: 'review cycles', path: '/api/performance/review-cycles', permissions: ['performance.reviews.view', 'performance.reviews.manage'] },
  { name: 'performance reports', path: '/api/performance/reports/goals', permissions: ['performance.reports'] },
];

beforeAll(async () => {
  process.env.JWT_SECRET = 'aurora-hr-api-tests-only-secret';
  passwordHash = await bcrypt.hash(password, 4);
  users.forEach((user) => {
    user.password_hash = passwordHash;
  });
});

beforeEach(() => {
  permissionOverrides.clear();
  poolQuery.mockReset();
  poolQuery.mockImplementation(async (sql, params = []) => {
    const query = String(sql).replace(/\s+/g, ' ').trim();

    if (query.includes('FROM hrm_users WHERE email = ?')) {
      return [users.filter((user) => user.email === params[0]), []];
    }
    if (query.includes('FROM hrm_users WHERE id = ? LIMIT 1')) {
      return [users.filter((user) => user.id === Number(params[0])), []];
    }
    if (query.includes('FROM hrm_users u') && query.includes('WHERE u.id = ?')) {
      const user = users.find((item) => item.id === Number(params[0]));
      return [[{
        ...user,
        employee_code: user?.employee_id ? 'EMP-TEST' : null,
        designation: 'Test employee',
        join_date: '2024-01-01',
        department_id: user?.employee_id ? 1 : null,
        employee_name: user?.employee_id ? 'Employee Test' : null,
        department_name: user?.employee_id ? 'Test department' : null,
        department_color: 'indigo',
      }].filter((row) => row.id), []];
    }
    if (query.includes('FROM hrm_employees e LEFT JOIN hrm_departments d') && query.includes('WHERE e.id = ?')) {
      return [[{ id: Number(params[0]), department_id: 1, first_name: 'Employee', last_name: 'Test' }], []];
    }
    if (query.includes('FROM hrm_role_permissions WHERE role = ?')) {
      const permissions = permissionOverrides.has(params[0])
        ? permissionOverrides.get(params[0])
        : DEFAULT_ROLE_PERMISSIONS[params[0]] || [];
      return [permissions.map((permission) => ({ permission })), []];
    }
    if (query.includes('FROM hrm_role_permissions ORDER BY')) {
      return [ROLE_KEYS.flatMap((role) => (DEFAULT_ROLE_PERMISSIONS[role] || []).map((permission) => ({ role, permission }))), []];
    }
    if (/^\s*SELECT/i.test(query)) {
      if (/COUNT\s*\(|SUM\s*\(|AVG\s*\(/i.test(query) && !/GROUP BY/i.test(query)) {
        const aggregate = {};
        for (const [, alias] of query.matchAll(/\bAS\s+([a-zA-Z_]\w*)/gi)) aggregate[alias] = 0;
        if (!Object.hasOwn(aggregate, 'count')) aggregate.count = 0;
        if (!Object.hasOwn(aggregate, 'total')) aggregate.total = 0;
        return [[aggregate], []];
      }
      return [[], []];
    }
    return [{ affectedRows: 1, insertId: 9001 }, []];
  });
});

async function tokenFor(role) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: `${role}@example.test`, password });
  expect(response.status).toBe(200);
  return response.body.token;
}

describe('API health and authentication', () => {
  it('exposes a healthy API without accessing the database', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'aurora-hr-api' });
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it.each(ROLE_KEYS)('authenticates and returns the current identity for %s', async (role) => {
    const token = await tokenFor(role);
    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe(role);
    expect(response.body.user.permissions).toEqual(
      role === 'super_admin' ? PERMISSION_KEYS : DEFAULT_ROLE_PERMISSIONS[role]
    );
  });

  it.each([
    ['missing credentials', {}, 400],
    ['unknown account', { email: 'unknown@example.test', password }, 401],
    ['incorrect password', { email: 'hr@example.test', password: 'wrong-password' }, 401],
  ])('rejects login with %s', async (_label, payload, status) => {
    const response = await request(app).post('/api/auth/login').send(payload);
    expect(response.status).toBe(status);
  });

  it('rejects missing and malformed bearer tokens', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid')).status).toBe(401);
  });

  it('rejects a deactivated account on login and on an existing token', async () => {
    const employee = users.find((user) => user.role === 'employee');
    employee.is_active = 0;
    const login = await request(app).post('/api/auth/login').send({ email: employee.email, password });
    expect(login.status).toBe(403);
    employee.is_active = 1;
    const token = await tokenFor('employee');
    employee.is_active = 0;
    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
    employee.is_active = 1;
  });
});

describe('Backend five-role API permission matrix', () => {
  it.each(roleMatrix)('requires authentication for $name', async ({ path }) => {
    const response = await request(app).get(path);
    expect(response.status).toBe(401);
  });

  it.each(roleMatrix.flatMap((route) =>
    ROLE_KEYS.map((role) => ({ ...route, role }))
  ))('$role $name access matches its permission policy', async ({ role, path, permissions }) => {
    const token = await tokenFor(role);
    const response = await request(app).get(path).set('Authorization', `Bearer ${token}`);
    const allowed = !permissions.length || matchPermissions(role, permissions);
    expect(response.status).toBe(allowed ? 200 : 403);
  });

  it('allows employees to read only their own employee profile', async () => {
    const token = await tokenFor('employee');
    const own = await request(app).get('/api/employees/1005').set('Authorization', `Bearer ${token}`);
    const other = await request(app).get('/api/employees/1006').set('Authorization', `Bearer ${token}`);
    expect(own.status).toBe(200);
    expect(other.status).toBe(403);
  });

  it('denies dashboard access when the live role grants omit dashboard.view', async () => {
    permissionOverrides.set('hr', []);
    const token = await tokenFor('hr');
    poolQuery.mockClear();

    const response = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(poolQuery.mock.calls.some(([sql]) => String(sql).includes('FROM hrm_employees'))).toBe(false);
  });

  it('denies unsupported roles even when they have a dashboard grant', async () => {
    permissionOverrides.set('custom', ['dashboard.view']);
    const token = await tokenFor('custom');
    poolQuery.mockClear();

    const response = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(poolQuery).toHaveBeenCalledTimes(2);
    expect(poolQuery.mock.calls.some(([sql]) => String(sql).includes('FROM hrm_employees'))).toBe(false);
  });

  it.each(['super_admin', 'ceo', 'administration', 'hr'])(
    'keeps the authorized organization dashboard for %s',
    async (role) => {
      const token = await tokenFor(role);
      const response = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.role).toBe(role);
      expect(poolQuery.mock.calls.some(([sql]) => String(sql).includes('FROM hrm_employees'))).toBe(true);
    }
  );

  it('keeps employee dashboard queries personal and omits payroll without payroll.self', async () => {
    permissionOverrides.set('employee', ['dashboard.view', 'attendance.self', 'leaves.self']);
    const token = await tokenFor('employee');
    const defaultImplementation = poolQuery.getMockImplementation();
    poolQuery.mockImplementation(async (sql, params = []) => {
      if (String(sql).includes('FROM hrm_employees e LEFT JOIN hrm_departments d') && String(sql).includes('WHERE e.id = ?')) {
        return [[{ id: Number(params[0]), department_id: 1, salary: 95000, first_name: 'Employee', last_name: 'Test' }], []];
      }
      return defaultImplementation(sql, params);
    });

    const response = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.role).toBe('employee');
    expect(response.body.employee).not.toHaveProperty('salary');
    expect(response.body.my.latestPayroll).toBeNull();
    const employeeAggregates = poolQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('FROM hrm_employees') && !String(sql).includes('WHERE e.id = ?')
    );
    expect(employeeAggregates).toHaveLength(2);
    expect(employeeAggregates.every(([, params]) => params.includes(1005))).toBe(true);
    expect(poolQuery.mock.calls.filter(([sql]) => String(sql).includes('FROM hrm_payroll'))).toEqual([]);
  });
});

describe('notification authorization and persistence', () => {
  it('requires dashboard permission for notification APIs', async () => {
    permissionOverrides.set('hr', []);
    const token = await tokenFor('hr');

    const response = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('does not query leave or employee details when those grants are absent', async () => {
    permissionOverrides.set('administration', ['dashboard.view']);
    const token = await tokenFor('administration');
    poolQuery.mockClear();

    const response = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(poolQuery.mock.calls.some(([sql]) => String(sql).includes('FROM hrm_leaves l JOIN hrm_employees'))).toBe(false);
    expect(poolQuery.mock.calls.some(([sql]) => String(sql).includes('WHERE join_date >= DATE_SUB'))).toBe(false);
  });

  it('hides persisted notifications when their visibility permission is revoked', async () => {
    permissionOverrides.set('administration', ['dashboard.view']);
    const token = await tokenFor('administration');
    const defaultImplementation = poolQuery.getMockImplementation();
    poolQuery.mockImplementation(async (sql, params = []) => {
      if (String(sql).includes('FROM hrm_notifications') && String(sql).includes('ORDER BY created_at DESC')) {
        return [params.includes('leaves.manage') ? [{ id: 91, type: 'leave', title: 'Leave pending' }] : [], []];
      }
      return defaultImplementation(sql, params);
    });

    const response = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    const listQuery = poolQuery.mock.calls.find(([sql]) =>
      String(sql).includes('FROM hrm_notifications') && String(sql).includes('ORDER BY created_at DESC')
    );
    expect(listQuery[0]).toContain('visibility_permission IN (?)');
    expect(listQuery[1]).toContain('dashboard.view');
    expect(listQuery[1]).not.toContain('leaves.manage');
  });

  it('uses only own payroll fields for employee notification content', async () => {
    permissionOverrides.set('employee', ['dashboard.view', 'payroll.self']);
    const token = await tokenFor('employee');
    const defaultImplementation = poolQuery.getMockImplementation();
    poolQuery.mockImplementation(async (sql, params = []) => {
      if (String(sql).includes('SELECT id, month, status FROM hrm_payroll WHERE employee_id = ?')) {
        return [[{ id: 33, month: '2026-11', status: 'paid', net_pay: 987654 }], []];
      }
      return defaultImplementation(sql, params);
    });
    poolQuery.mockClear();

    const response = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    const payrollRead = poolQuery.mock.calls.find(([sql]) => String(sql).includes('FROM hrm_payroll WHERE employee_id = ?'));
    expect(String(payrollRead[0])).not.toContain('net_pay');
    const notificationInsert = poolQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO hrm_notifications'));
    expect(notificationInsert[1]).not.toContain(987654);
    expect(notificationInsert[1]).toContain('2026-11');
  });

  it('scopes marking a notification as read to the authenticated recipient', async () => {
    const token = await tokenFor('employee');
    const defaultImplementation = poolQuery.getMockImplementation();
    poolQuery.mockImplementation(async (sql, params = []) => {
      if (String(sql).includes('UPDATE hrm_notifications SET read_at')) return [{ affectedRows: 0 }, []];
      return defaultImplementation(sql, params);
    });

    const response = await request(app)
      .patch('/api/notifications/77/read')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(404);
    const update = poolQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE hrm_notifications SET read_at'));
    expect(update[0]).toContain('recipient_user_id = ?');
    expect(update[0]).toContain('visibility_permission IN (');
    expect(update[1].slice(0, 2)).toEqual([77, 5]);
    expect(update[1]).toContain('dashboard.view');
  });

  it('marks all notifications read only for the signed-in recipient', async () => {
    const token = await tokenFor('employee');
    const response = await request(app)
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    const update = poolQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE hrm_notifications SET read_at'));
    expect(update[0]).toContain('recipient_user_id = ?');
    expect(update[0]).toContain('visibility_permission IN (');
    expect(update[1][0]).toBe(5);
    expect(update[1]).toContain('dashboard.view');
  });

  it('defines an additive recipient-owned notification table with deduplication', () => {
    const ddl = NOTIFICATION_SCHEMA.join(' ');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS hrm_notifications');
    expect(ddl).toContain('UNIQUE KEY uq_notification_recipient_dedupe');
    expect(ddl).toContain('recipient_user_id');
    expect(ddl).toContain('visibility_permission VARCHAR(64) NOT NULL');
    expect(ddl).not.toMatch(/\b(DROP|TRUNCATE|DELETE\s+FROM)\b/i);
  });
});

describe('salary visibility across employee and payroll APIs', () => {
  const salaryValue = 88400;

  it.each(ROLE_KEYS)('%s profile salary follows payroll scope and ownership', async (role) => {
    const token = await tokenFor(role);
    const defaultImplementation = poolQuery.getMockImplementation();
    poolQuery.mockImplementation(async (sql, params = []) => {
      const query = String(sql).replace(/\s+/g, ' ').trim();
      if (query.includes('FROM hrm_employees e LEFT JOIN hrm_departments d') && query.includes('WHERE e.id = ?')) {
        return [[{ id: Number(params[0]), department_id: 1, salary: salaryValue, first_name: 'Employee', last_name: 'Test' }], []];
      }
      return defaultImplementation(sql, params);
    });

    const response = await request(app)
      .get('/api/employees/1005')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    const canSeeSalary = role === 'employee'
      || role === 'super_admin'
      || DEFAULT_ROLE_PERMISSIONS[role].includes('payroll.view_all');
    expect(response.body.employee.salary === salaryValue).toBe(canSeeSalary);
    if (!canSeeSalary) expect(response.body.payroll).toEqual([]);
  });

  it.each(['super_admin', 'ceo', 'administration', 'hr'])(
    '%s employee directory serializes salary only for payroll.view_all',
    async (role) => {
      const token = await tokenFor(role);
      const defaultImplementation = poolQuery.getMockImplementation();
      poolQuery.mockImplementation(async (sql, params = []) => {
        const query = String(sql).replace(/\s+/g, ' ').trim();
        if (query.includes('FROM hrm_employees e') && query.includes('ORDER BY') && query.includes('LIMIT ? OFFSET ?')) {
          return [[{ id: 1005, salary: salaryValue }], []];
        }
        return defaultImplementation(sql, params);
      });

      const response = await request(app)
        .get('/api/employees?page=1')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      const canSeeSalary = role === 'super_admin' || DEFAULT_ROLE_PERMISSIONS[role].includes('payroll.view_all');
      expect(response.body.data[0]?.salary === salaryValue).toBe(canSeeSalary);
    }
  );

  it.each(['super_admin', 'ceo', 'administration', 'hr'])(
    '%s department aggregates hide payroll values without payroll.view_all',
    async (role) => {
      const token = await tokenFor(role);
      const defaultImplementation = poolQuery.getMockImplementation();
      poolQuery.mockImplementation(async (sql, params = []) => {
        const query = String(sql).replace(/\s+/g, ' ').trim();
        if (query.includes('FROM hrm_departments d') && query.includes('AVG(e.salary)')) {
          return [[{ id: 1, employee_count: 3, payroll_total: salaryValue * 3, avg_salary: salaryValue }], []];
        }
        return defaultImplementation(sql, params);
      });

      const response = await request(app).get('/api/departments').set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      const canSeeSalary = role === 'super_admin' || DEFAULT_ROLE_PERMISSIONS[role].includes('payroll.view_all');
      expect(response.body.data[0]?.avg_salary === salaryValue).toBe(canSeeSalary);
      expect(response.body.data[0]?.payroll_total === salaryValue * 3).toBe(canSeeSalary);
    }
  );

  it('scopes employee payroll list requests to their linked employee ID', async () => {
    const token = await tokenFor('employee');
    const response = await request(app).get('/api/payroll?employeeId=2002').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(poolQuery.mock.calls.some(([sql, params]) =>
      String(sql).includes('p.employee_id = ?') && params.includes(1005) && !params.includes(2002)
    )).toBe(true);
  });

  it('omits recruitment offer salary aggregates without payroll.view_all', async () => {
    permissionOverrides.set('administration', ['recruitment.reports.view']);
    const token = await tokenFor('administration');
    const defaultImplementation = poolQuery.getMockImplementation();
    poolQuery.mockImplementation(async (sql, params = []) => {
      if (String(sql).includes('FROM recruitment_offers GROUP BY status')) {
        return [[{ status: 'sent', count: 1, average_salary: salaryValue }], []];
      }
      return defaultImplementation(sql, params);
    });
    const response = await request(app).get('/api/recruitment/reports').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    const offerQuery = poolQuery.mock.calls.find(([sql]) => String(sql).includes('FROM recruitment_offers GROUP BY status'));
    expect(String(offerQuery[0])).not.toContain('AVG(annual_salary)');
    expect(response.body.offers[0]).not.toHaveProperty('averageSalary');
  });
});

describe('critical module query and validation contracts', () => {
  it('applies employee, payroll, expense, and performance query scopes', async () => {
    const adminToken = await tokenFor('super_admin');
    poolQuery.mockClear();
    const employees = await request(app)
      .get('/api/employees?search=Sarah&department=2&status=active&page=2&limit=5&sort=name')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(employees.status).toBe(200);
    expect(employees.body.pagination).toMatchObject({ page: 2, limit: 5, total: 0 });
    expect(poolQuery.mock.calls.some(([sql, params]) =>
      String(sql).includes('e.department_id = ?') &&
      String(sql).includes('e.status = ?') &&
      params.includes('%Sarah%') &&
      params.slice(-2).join(',') === '5,5'
    )).toBe(true);

    poolQuery.mockClear();
    const payroll = await request(app)
      .get('/api/payroll?month=2026-03&employeeId=1005&departmentId=2&status=pending')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(payroll.status).toBe(200);
    expect(payroll.body).toMatchObject({ month: '2026-03', totals: { count: 0 } });
    expect(poolQuery.mock.calls.some(([sql, params]) =>
      String(sql).includes('FROM hrm_payroll') &&
      params.join(',') === '2026-03,1005,2,pending'
    )).toBe(true);

    const employeeToken = await tokenFor('employee');
    poolQuery.mockClear();
    const categories = await request(app)
      .get('/api/expenses/categories')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(categories.status).toBe(200);
    expect(categories.body).toHaveProperty('currencies');

    poolQuery.mockClear();
    const goals = await request(app)
      .get('/api/performance/goals')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(goals.status).toBe(200);
    expect(goals.body).toHaveProperty('stats.total');
    expect(poolQuery.mock.calls.some(([sql, params]) =>
      String(sql).includes('g.employee_id = ?') && params.includes(1005)
    )).toBe(true);
  });

  it('rejects invalid employee and payroll writes before database mutations', async () => {
    const token = await tokenFor('super_admin');
    poolQuery.mockClear();

    const employee = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'not-an-email' });
    expect(employee.status).toBe(400);

    const payroll = await request(app)
      .post('/api/payroll/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ month: 'not-a-month' });
    expect(payroll.status).toBe(400);
    expect(poolQuery.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE|DELETE)/i.test(String(sql)))).toBe(false);
  });
});

describe('performance dashboard and goal ownership scoping', () => {
  const normalisedCalls = () =>
    poolQuery.mock.calls.map(([sql, params]) => ({
      sql: String(sql).replace(/\s+/g, ' ').trim(),
      params: params || [],
    }));

  it('returns personal performance data only for an employee', async () => {
    const token = await tokenFor('employee');
    poolQuery.mockClear();
    const response = await request(app)
      .get('/api/performance/dashboard?range=this_month')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.scope).toBe('personal');
    expect(response.body.stats).not.toHaveProperty('totalEmployees');
    expect(response.body.byDepartment).toEqual([]);
    expect(response.body.recentActivities).toEqual([]);

    const calls = normalisedCalls();
    expect(calls.some(({ sql }) => sql.includes("FROM hrm_employees WHERE status <> 'inactive'"))).toBe(false);
    expect(calls.some(({ sql, params }) =>
      sql.includes('FROM performance_goals g') && sql.includes('g.employee_id = ?') && params.includes(1005)
    )).toBe(true);
    expect(calls.some(({ sql, params }) =>
      sql.includes('JOIN performance_review_cycle_employees ce') && params.includes(1005)
    )).toBe(true);
    expect(calls.some(({ sql, params }) =>
      sql.includes('performance_activity_logs') && params.filter((value) => value === 1005).length === 2
    )).toBe(true);
  });

  it.each(['super_admin', 'ceo', 'administration', 'hr'])(
    'keeps the organisation-wide dashboard for %s',
    async (role) => {
      const token = await tokenFor(role);
      const response = await request(app)
        .get('/api/performance/dashboard?range=this_month')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.scope).toBe('organisation');
      expect(response.body.stats).toHaveProperty('totalEmployees');
    }
  );

  it('blocks an employee from requesting another employee\'s goals', async () => {
    const token = await tokenFor('employee');
    const response = await request(app)
      .get('/api/performance/goals?employeeId=2002')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/own goals/i);
  });

  it('blocks an employee from opening another employee\'s goal details', async () => {
    const token = await tokenFor('employee');
    const baseImplementation = poolQuery.getMockImplementation();
    poolQuery.mockImplementation(async (sql, params = []) => {
      const query = String(sql).replace(/\s+/g, ' ').trim();
      if (
        query.includes('FROM performance_goals g JOIN hrm_employees e ON e.id = g.employee_id') &&
        query.includes('WHERE g.id = ?')
      ) {
        return [[{
          id: Number(params[0]),
          employee_id: 2002,
          status: 'in_progress',
          target_date: '2026-12-31',
          progress_percentage: 10,
        }], []];
      }
      return baseImplementation(sql, params);
    });

    const response = await request(app)
      .get('/api/performance/goals/777')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/own goals/i);
  });
});

describe('API validation and error handling', () => {
  it('validates account profile and password requests', async () => {
    const token = await tokenFor('employee');
    const profile = await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'not-an-email' });
    const passwordChange = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'anything', newPassword: 'short' });
    expect(profile.status).toBe(400);
    expect(passwordChange.status).toBe(400);
  });

  it('returns validation errors before writing invalid departments', async () => {
    const adminToken = await tokenFor('super_admin');
    const deniedToken = await tokenFor('ceo');
    expect((await request(app).post('/api/departments').set('Authorization', `Bearer ${adminToken}`).send({})).status).toBe(400);
    expect((await request(app).post('/api/departments').set('Authorization', `Bearer ${deniedToken}`).send({})).status).toBe(403);
  });

  it('maps database duplicate-key errors to conflict responses', async () => {
    const token = await tokenFor('super_admin');
    const defaultQuery = poolQuery.getMockImplementation();
    poolQuery.mockImplementation(async (sql, params) => {
      if (String(sql).includes('INSERT INTO hrm_departments')) {
        const error = new Error('duplicate key');
        error.code = 'ER_DUP_ENTRY';
        throw error;
      }
      return defaultQuery(sql, params);
    });
    const response = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test department' });
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/already exists/i);
  });

  it('returns a sanitized server error when the database is unavailable', async () => {
    const token = await tokenFor('hr');
    poolQuery.mockRejectedValue(new Error('private database connection detail'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request(app).get('/api/employees/options').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Something went wrong on our end. Please try again.');
    expect(JSON.stringify(response.body)).not.toContain('private database connection detail');
    log.mockRestore();
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const response = await request(app).get('/api/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Endpoint not found.');
  });
});

import { expect, test } from '@playwright/test';
import { DEFAULT_ROLE_PERMISSIONS } from '../../server/src/permissions.js';

const roleNames = {
  super_admin: 'Super Admin',
  ceo: 'CEO',
  administration: 'Administration',
  hr: 'HR',
  employee: 'Employee',
};

const routes = [
  { path: '/', permission: ['dashboard.view'] },
  { path: '/employees', permission: ['employees.view'] },
  { path: '/departments', permission: ['departments.view'] },
  { path: '/attendance', permission: ['attendance.view_all', 'attendance.self'] },
  { path: '/leaves', permission: ['leaves.view_all', 'leaves.self'] },
  { path: '/payroll', permission: ['payroll.view_all', 'payroll.self'] },
  { path: '/recruitment', permission: ['recruitment.view'] },
  { path: '/recruitment/offers', permission: ['recruitment.offers.view'] },
  { path: '/onboarding', permission: ['onboarding.view', 'onboarding.manage', 'onboarding.self'] },
  { path: '/offboarding/resignations', permission: ['offboarding.view', 'offboarding.manage', 'offboarding.self'] },
  { path: '/expenses', permission: ['expenses.dashboard', 'expenses.self'] },
  { path: '/expenses/reports', permission: ['expenses.reports'] },
  { path: '/performance', permission: ['performance.dashboard', 'performance.goals.self'] },
  { path: '/notifications', permission: ['dashboard.view'] },
  { path: '/performance/goals', permission: ['performance.goals.view', 'performance.goals.manage', 'performance.goals.self'] },
  { path: '/performance/review-cycles', permission: ['performance.reviews.view', 'performance.reviews.manage'] },
  { path: '/performance/reports', permission: ['performance.reports'] },
];

function isAllowed(role, permissions) {
  return permissions.some((permission) => (DEFAULT_ROLE_PERMISSIONS[role] || []).includes(permission));
}

async function mockApi(page, role) {
  const user = {
    id: role === 'super_admin' ? 1 : 2,
    name: `${roleNames[role]} Test`,
    email: `${role}@example.test`,
    role,
    roleLabel: roleNames[role],
    employeeId: role === 'employee' ? 1005 : null,
    permissions: DEFAULT_ROLE_PERMISSIONS[role],
  };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/login') {
      return route.fulfill({ json: { token: 'browser-only-token', user } });
    }
    if (url.pathname === '/api/auth/me') {
      return route.fulfill({ json: { user, employee: null } });
    }
    if (url.pathname === '/api/notifications') {
      if (route.request().method() === 'GET') {
        const allItems = [
          { id: 501, type: 'leave', title: 'Leave request update', body: 'Your leave request is awaiting review.', to: '/leaves', readAt: null, createdAt: '2026-11-01' },
          { id: 502, type: 'success', title: 'Welcome update', body: 'A new team member joined.', to: '/employees', readAt: '2026-10-30', createdAt: '2026-10-30' },
        ];
        const items = url.searchParams.get('filter') === 'unread'
          ? allItems.filter((item) => !item.readAt)
          : allItems;
        return route.fulfill({ json: { items, count: items.length, unreadCount: 1 } });
      }
      return route.fulfill({ json: { message: 'Notification updated.' } });
    }
    if (url.pathname === '/api/notifications/unread-count') {
      return route.fulfill({ json: { count: 1 } });
    }
    if (url.pathname === '/api/dashboard') {
      return route.fulfill({
        json: {
          role: role === 'employee' ? 'employee' : 'manager',
          stats: {
            attendanceRate: 0,
            pendingLeaves: 0,
            totalEmployees: 0,
            newHires: 0,
            presentToday: 0,
            lateToday: 0,
            remoteToday: 0,
            notMarked: 0,
            approvedLeaves: 0,
            monthlyPayroll: 0,
            payrollPaid: 0,
            payrollPending: 0,
            activeEmployees: 0,
          },
          attendanceToday: { present: 0, late: 0, remote: 0, halfDay: 0, notMarked: 0 },
          headcountTrend: [],
          departmentDistribution: [],
          weeklyAttendance: [],
          pendingLeaves: [],
          recentHires: [],
          birthdays: [],
          employee: { designation: 'Test employee', department_name: 'Test department' },
          my: {
            today: null,
            attendanceRate: 0,
            attended: 0,
            daysRecorded: 0,
            late: 0,
            absent: 0,
            avgHours: 0,
            leave: { annualRemaining: 24, annualUsed: 0, annualTotal: 24, pending: 0 },
            latestPayroll: null,
          },
        },
      });
    }
    if (url.pathname === '/api/performance/dashboard') {
      const personal = role === 'employee';
      return route.fulfill({
        json: {
          scope: personal ? 'personal' : 'organisation',
          range: { from: null, to: null },
          stats: {
            ...(personal ? {} : { totalEmployees: 32 }),
            totalGoals: personal ? 2 : 9,
            inProgress: personal ? 1 : 4,
            completed: personal ? 1 : 3,
            pending: 0,
            overdue: 0,
            cancelled: 0,
            activeReviewCycles: personal ? 1 : 2,
            completedReviewCycles: personal ? 0 : 1,
          },
          statusBreakdown: [
            { status: 'in_progress', count: personal ? 1 : 4 },
            { status: 'completed', count: personal ? 1 : 3 },
          ],
          monthly: [],
          byDepartment: personal
            ? []
            : [{ name: 'Engineering', color: 'indigo', total: 4, completed: 2 }],
          recentActivities: personal
            ? [{
                id: 1,
                action: 'progress_updated',
                goal_title: 'My personal goal',
                description: 'Progress updated from 10% to 40%.',
                created_at: '2026-11-01',
                user_name: 'Employee Test',
              }]
            : [{
                id: 2,
                action: 'progress_updated',
                goal_title: 'Organisation goal',
                description: 'Progress updated from 10% to 40%.',
                created_at: '2026-11-01',
                user_name: 'HR Test',
              }],
        },
      });
    }
    if (route.request().method() === 'GET') {
      return route.fulfill({
        json: {
          data: [],
          rows: [],
          stats: {},
          summary: {},
          pagination: { page: 1, limit: 10, total: 0, pages: 0 },
          total: 0,
          pages: 0,
          departments: [],
          employees: [],
          notifications: [],
        },
      });
    }
    return route.fulfill({ status: 201, json: { id: 9001, message: 'Test fixture saved.' } });
  });
}

async function signIn(page, role) {
  await page.goto('/login');
  await page.getByPlaceholder('you@company.com').fill(`${role}@example.test`);
  await page.getByPlaceholder('Enter your password').fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page).toHaveURL('/');
}

test('login, sidebar navigation, and logout work against API fixtures', async ({ page }) => {
  await mockApi(page, 'hr');
  await signIn(page, 'hr');
  await page.getByRole('button', { name: /HR Test/ }).click();
  await expect(page.getByRole('button', { name: 'Sign out' }).last()).toBeVisible();
  await page.goto('/performance/goals');
  await expect(page.getByRole('main').getByRole('heading', { name: 'Goal management' })).toBeVisible();
  const searchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === '/api/performance/goals' && url.searchParams.get('search') === 'regression';
  });
  await page.getByPlaceholder('Search goals or employees…').fill('regression');
  await searchRequest;
  await page.getByRole('main').getByRole('button', { name: 'Assign goal' }).first().click();
  await expect(page.getByRole('heading', { name: 'Assign a goal' })).toBeVisible();
  await page.getByRole('button', { name: 'Assign goal', exact: true }).last().click();
  await expect(page.getByText('Please enter a goal title.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: /HR Test/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).last().click();
  await expect(page).toHaveURL(/\/login$/);
});

test('login validation and rejected credentials remain on the sign-in page', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ status: 401, json: { message: 'Invalid email or password.' } })
  );
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page.getByText('Enter your email and password to continue.')).toBeVisible();
  await page.getByPlaceholder('you@company.com').fill('user@example.test');
  await page.getByPlaceholder('Enter your password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page.getByText('Invalid email or password.')).toBeVisible();
});

for (const role of Object.keys(roleNames)) {
  test(`${roleNames[role]} route access follows the frontend permission matrix`, async ({ page }) => {
    await mockApi(page, role);
    await signIn(page, role);

    for (const route of routes) {
      await page.goto(route.path);
      if (isAllowed(role, route.permission)) {
        await expect.poll(() => new URL(page.url()).pathname).toBe(route.path);
        await expect(page.locator('header h1')).toBeVisible();
      } else {
        await expect.poll(() => new URL(page.url()).pathname).toBe('/');
      }
    }

    const navLabels = await page.locator('aside').innerText();
    if (role === 'employee') {
      expect(navLabels).not.toContain('Performance reports');
      expect(navLabels).not.toContain('Expense reports');
    }
  });
}

test('employee performance dashboard shows only personal metrics', async ({ page }) => {
  await mockApi(page, 'employee');
  await signIn(page, 'employee');
  await page.goto('/performance');

  const main = page.getByRole('main');
  await expect(main.getByText('My assigned goals')).toBeVisible();
  await expect(main.getByText('My active review cycles')).toBeVisible();
  await expect(main.getByText('My completed review cycles')).toBeVisible();
  await expect(main.getByText('My monthly goal completion')).toBeVisible();
  await expect(main.getByText('My goal status distribution')).toBeVisible();
  await expect(main.getByText('My recent activity')).toBeVisible();
  await expect(main.getByText('My personal goal')).toBeVisible();

  await expect(main.getByText('Total employees')).toHaveCount(0);
  await expect(main.getByText('Active employees')).toHaveCount(0);
  await expect(main.getByText('Department-wise goal progress')).toHaveCount(0);
  await expect(main.getByText('Organisation goal')).toHaveCount(0);
});

for (const role of ['super_admin', 'ceo', 'administration', 'hr']) {
  test(`${roleNames[role]} performance dashboard keeps organisation-wide metrics`, async ({ page }) => {
    await mockApi(page, role);
    await signIn(page, role);
    await page.goto('/performance');

    const main = page.getByRole('main');
    await expect(main.getByText(/A live view of organisation/i)).toBeVisible();
    await expect(main.getByText('Goals assigned')).toBeVisible();
    await expect(main.getByText('Department-wise goal progress')).toBeVisible();
    await expect(main.getByText('Monthly goal completion')).toBeVisible();
    await expect(main.getByText('Goal status distribution')).toBeVisible();
    await expect(main.getByText('Recent activity')).toBeVisible();
    await expect(main.getByText('Total employees')).toBeVisible();
    await expect(main.getByText('Active review cycles')).toBeVisible();
    await expect(main.getByText('Completed review cycles')).toBeVisible();
  });
}

test('primary pages stay within common responsive viewports', async ({ page }) => {
  test.setTimeout(90_000);
  await mockApi(page, 'hr');
  await signIn(page, 'hr');
  const sizes = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ];

  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const path of ['/', '/employees', '/attendance', '/leaves', '/payroll', '/recruitment', '/expenses', '/performance']) {
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/login$/);
      const dimensions = await page.locator('html').evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      const overflowingElements = await page.locator('body').evaluate((body) => {
        const width = document.documentElement.clientWidth;
        return [...body.querySelectorAll('*')]
          .map((element) => ({ tag: element.tagName, className: String(element.className || '').slice(0, 100), right: Math.round(element.getBoundingClientRect().right) }))
          .filter((element) => element.right > width + 1)
          .slice(0, 5);
      });
      expect(
        dimensions.scrollWidth,
        `Horizontal overflow at ${size.width}x${size.height} on ${path}: ${JSON.stringify({ dimensions, overflowingElements })}`
      ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    }
  }
});

test('all registered authenticated pages render for a Super Admin using API fixtures', async ({ page }) => {
  test.setTimeout(180_000);
  await mockApi(page, 'super_admin');
  await signIn(page, 'super_admin');

  const paths = [
    '/',
    '/employees',
    '/departments',
    '/attendance',
    '/leaves',
    '/payroll',
    '/reports',
    '/access',
    '/audit',
    '/settings',
    '/recruitment',
    '/recruitment/jobs',
    '/recruitment/jobs/1',
    '/recruitment/candidates',
    '/recruitment/candidates/1',
    '/recruitment/pipeline',
    '/recruitment/applications',
    '/recruitment/interviews',
    '/recruitment/offers',
    '/recruitment/offers/1',
    '/recruitment/reports',
    '/onboarding',
    '/onboarding/records/1',
    '/onboarding/templates',
    '/offboarding/resignations',
    '/offboarding/notice-periods',
    '/offboarding/exit-documents',
    '/expenses',
    '/expenses/my',
    '/expenses/claims',
    '/expenses/approvals',
    '/expenses/reimbursements',
    '/expenses/categories',
    '/expenses/reports',
    '/expenses/settings',
    '/performance',
    '/performance/goals',
    '/performance/progress',
    '/performance/review-cycles',
    '/performance/review-history',
    '/performance/reports',
    '/notifications',
  ];
  const pageErrors = [];
  const consoleErrors = [];
  const failedApiResponses = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 400) {
      failedApiResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator('header h1'), `${path} should render its page heading`).toBeVisible();
  }

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedApiResponses).toEqual([]);
});

test('candidate portal explains that a token is required', async ({ page }) => {
  await page.goto('/portal/candidate');
  await expect(page.getByText('No candidate authorization token provided in the URL.')).toBeVisible();
});

for (const role of Object.keys(roleNames)) {
  test(`${roleNames[role]} sees leave dashboard wording appropriate to their permission`, async ({ page }) => {
    await mockApi(page, role);
    await signIn(page, role);
    if (role === 'employee') {
      await expect(page.getByRole('button', { name: /Review leaves|View leave requests/ })).toHaveCount(0);
      return;
    }
    const label = DEFAULT_ROLE_PERMISSIONS[role].includes('leaves.manage')
      ? 'Review leaves'
      : 'View leave requests';
    await expect(page.getByRole('button', { name: new RegExp(label) })).toBeVisible();
    if (!DEFAULT_ROLE_PERMISSIONS[role].includes('leaves.manage')) {
      await expect(page.getByRole('button', { name: /Approve|Reject/ })).toHaveCount(0);
    }
  });
}

test('notification inbox filters unread items and marks notifications read', async ({ page }) => {
  const updated = [];
  await mockApi(page, 'hr');
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().includes('/api/notifications/')) {
      updated.push(new URL(request.url()).pathname);
    }
  });
  await signIn(page, 'hr');
  await page.goto('/notifications');
  await expect(page.locator('main').getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(page.getByText('Leave request update')).toBeVisible();
  await page.getByRole('tab', { name: 'Unread' }).click();
  await expect(page.getByText('Welcome update')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mark read' }).click();
  await expect.poll(() => updated).toContain('/api/notifications/501/read');
  await page.getByRole('tab', { name: 'All' }).click();
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await expect.poll(() => updated).toContain('/api/notifications/read-all');
});

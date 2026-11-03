import { Router } from 'express';
import pool from '../db.js';
import { ApiError, asyncHandler, isoDate, monthKey, addMonths, pad } from '../utils.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { ROLE_KEYS } from '../permissions.js';

const router = Router();
router.use(authenticate);

const monthLabel = (d) => d.toLocaleString('en-US', { month: 'short' });
const supportedRoles = new Set(ROLE_KEYS);
const emptyRows = Promise.resolve([[], []]);
const emptyAggregate = Promise.resolve([[
  {
    total: 0, active: 0, on_leave: 0, probation: 0, new_this_month: 0,
    count: 0, pending: 0, approved_this_month: 0, present: 0, late: 0,
    remote: 0, half_day: 0, absent: 0, marked: 0, net: 0, paid: 0,
  },
], []]);

router.get(
  '/',
  requirePermission('dashboard.view'),
  asyncHandler(async (req, res) => {
    if (!supportedRoles.has(req.user.role)) {
      throw new ApiError(403, 'Your role is not permitted to access this dashboard.');
    }

    const isManager = req.user.role !== 'employee';
    const now = new Date();
    const currentMonth = monthKey(now);

    if (!isManager) {
      return employeeDashboard(req, res, currentMonth);
    }

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = addMonths(now, -i);
      months.push({ d, last: isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)) });
    }

    const canViewEmployees = req.permissions.includes('employees.view');
    const canViewDepartments = req.permissions.includes('departments.view');
    const canViewAttendance = req.permissions.includes('attendance.view_all');
    const canViewLeaves = req.permissions.includes('leaves.view_all');
    const canViewPayroll = req.permissions.includes('payroll.view_all');

    const [headR, deptR, leaveR, attR, payR, deptDistR, hiresR, pendingR, weeklyR, bdayR, ...trendR] = await Promise.all([
      canViewEmployees ? pool.query(`
        SELECT COUNT(*) AS total,
               COALESCE(SUM(status = 'active'), 0) AS active,
               COALESCE(SUM(status = 'on-leave'), 0) AS on_leave,
               COALESCE(SUM(status = 'probation'), 0) AS probation,
               COALESCE(SUM(join_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')), 0) AS new_this_month
        FROM hrm_employees
      `) : emptyAggregate,
      canViewDepartments ? pool.query('SELECT COUNT(*) AS count FROM hrm_departments') : emptyAggregate,
      canViewLeaves ? pool.query(`
        SELECT COALESCE(SUM(status = 'pending'), 0) AS pending,
               COALESCE(SUM(status = 'approved' AND start_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')), 0) AS approved_this_month
        FROM hrm_leaves
      `) : emptyAggregate,
      canViewAttendance ? pool.query(`
        SELECT COALESCE(SUM(status = 'present'), 0) AS present,
               COALESCE(SUM(status = 'late'), 0) AS late,
               COALESCE(SUM(status = 'remote'), 0) AS remote,
               COALESCE(SUM(status = 'half-day'), 0) AS half_day,
               COALESCE(SUM(status = 'absent'), 0) AS absent,
               COUNT(*) AS marked
        FROM hrm_attendance WHERE date = CURDATE()
      `) : emptyAggregate,
      canViewPayroll ? pool.query(`
        SELECT COALESCE(SUM(net_pay), 0) AS net,
               COALESCE(SUM(status = 'paid'), 0) AS paid,
               COALESCE(SUM(status = 'pending'), 0) AS pending,
               COUNT(*) AS count
        FROM hrm_payroll WHERE month = ?
      `, [currentMonth]) : emptyAggregate,
      canViewDepartments && canViewEmployees ? pool.query(`
        SELECT d.name, d.color, COUNT(e.id) AS count
        FROM hrm_departments d
        LEFT JOIN hrm_employees e ON e.department_id = d.id AND e.status <> 'inactive'
        GROUP BY d.id, d.name, d.color
        ORDER BY count DESC
      `) : emptyRows,
      canViewEmployees ? pool.query(`
        SELECT e.id, e.first_name, e.last_name, e.designation, e.join_date, e.avatar_color, e.status,
               d.name AS department_name
        FROM hrm_employees e LEFT JOIN hrm_departments d ON d.id = e.department_id
        WHERE e.status <> 'inactive'
        ORDER BY e.join_date DESC LIMIT 5
      `) : emptyRows,
      canViewLeaves ? pool.query(`
        SELECT l.id, l.type, l.status, l.start_date, l.end_date, l.days, l.created_at,
               e.first_name, e.last_name, e.avatar_color, d.name AS department_name
        FROM hrm_leaves l
        JOIN hrm_employees e ON e.id = l.employee_id
        LEFT JOIN hrm_departments d ON d.id = e.department_id
        WHERE l.status = 'pending'
        ORDER BY l.created_at ASC LIMIT 5
      `) : emptyRows,
      canViewAttendance ? pool.query(`
        SELECT date, status, COUNT(*) AS count FROM hrm_attendance
        WHERE date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND date <= CURDATE()
        GROUP BY date, status
      `) : emptyRows,
      canViewEmployees ? pool.query(`
        SELECT e.id, e.first_name, e.last_name, e.date_of_birth, e.avatar_color, e.designation,
               d.name AS department_name
        FROM hrm_employees e LEFT JOIN hrm_departments d ON d.id = e.department_id
        WHERE MONTH(e.date_of_birth) = MONTH(CURDATE()) AND e.status <> 'inactive'
        ORDER BY DAY(e.date_of_birth) LIMIT 4
      `) : emptyRows,
      ...months.map(({ last }) =>
        canViewEmployees
          ? pool.query('SELECT COUNT(*) AS count FROM hrm_employees WHERE join_date <= ? AND status <> \'inactive\'', [last])
          : emptyAggregate
      ),
    ]);

    const head = headR[0][0] || {};
    const deptRow = deptR[0][0] || {};
    const leaveRow = leaveR[0][0] || {};
    const attendanceToday = attR[0][0] || {};
    const payrollRow = payR[0][0] || {};
    const departmentDistribution = deptDistR[0];
    const recentHires = hiresR[0];
    const pendingLeaves = pendingR[0];
    const weeklyRows = weeklyR[0];
    const birthdays = bdayR[0];

    const headcountTrend = months.map(({ d }, i) => ({
      month: monthLabel(d),
      count: Number(trendR[i][0][0]?.count || 0),
      key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
    }));

    const weeklyMap = {};
    for (const r of weeklyRows) {
      const key = String(r.date).slice(5);
      weeklyMap[key] ||= { date: key, present: 0, late: 0, remote: 0, absent: 0, 'half-day': 0 };
      weeklyMap[key][r.status] = Number(r.count);
    }
    const weeklyAttendance = Object.values(weeklyMap).sort((a, b) => a.date.localeCompare(b.date));

    const marked = Number(attendanceToday.marked);
    const presentNow = Number(attendanceToday.present) + Number(attendanceToday.late) + Number(attendanceToday.remote) + Number(attendanceToday.half_day);
    const stats = {
      totalEmployees: Number(head.total),
      activeEmployees: Number(head.active),
      onLeave: Number(head.on_leave),
      probation: Number(head.probation),
      departments: Number(deptRow.count),
      newHires: Number(head.new_this_month),
      presentToday: presentNow,
      presentOnTime: Number(attendanceToday.present),
      lateToday: Number(attendanceToday.late),
      remoteToday: Number(attendanceToday.remote),
      absentToday: Math.max(0, Number(head.active) - marked) + Number(attendanceToday.absent),
      notMarked: Math.max(0, Number(head.active) - marked),
      pendingLeaves: Number(leaveRow.pending),
      approvedLeaves: Number(leaveRow.approved_this_month),
      monthlyPayroll: Number(payrollRow.net),
      payrollCount: Number(payrollRow.count),
      payrollPaid: Number(payrollRow.paid),
      payrollPending: Number(payrollRow.pending),
      attendanceRate: Number(head.active) ? Math.round((presentNow / Number(head.active)) * 100) : 0,
    };

    // Administration has operational access but no payroll visibility.
    if (!req.permissions.includes('payroll.view_all')) {
      delete stats.monthlyPayroll;
      delete stats.payrollCount;
      delete stats.payrollPaid;
      delete stats.payrollPending;
    }

    res.json({
      role: req.user.role,
      stats,
      headcountTrend,
      departmentDistribution,
      attendanceToday: {
        present: Number(attendanceToday.present),
        late: Number(attendanceToday.late),
        remote: Number(attendanceToday.remote),
        halfDay: Number(attendanceToday.half_day),
        absent: Number(attendanceToday.absent),
        notMarked: stats.notMarked,
        marked,
      },
      weeklyAttendance,
      recentHires,
      pendingLeaves,
      birthdays,
      payrollSummary: req.permissions.includes('payroll.view_all')
        ? { month: currentMonth, ...stats }
        : null,
    });
  })
);

async function employeeDashboard(req, res, currentMonth) {
  const employeeId = req.user.employeeId;
  if (!employeeId) return res.json({ role: 'employee', stats: {}, my: null });
  const canViewOwnAttendance = req.permissions.includes('attendance.self');
  const canViewOwnLeave = req.permissions.includes('leaves.self');
  const canViewOwnPayroll = req.permissions.includes('payroll.self') || req.permissions.includes('payroll.view_all');

  const [[employee]] = await pool.query(
    `SELECT e.*, d.name AS department_name, d.color AS department_color
     FROM hrm_employees e LEFT JOIN hrm_departments d ON d.id = e.department_id
     WHERE e.id = ?`,
    [employeeId]
  );
  if (!employee) return res.json({ role: 'employee', stats: {}, my: null });
  if (employee && !canViewOwnPayroll) delete employee.salary;

  const [todayRows] = canViewOwnAttendance
    ? await pool.query('SELECT * FROM hrm_attendance WHERE employee_id = ? AND date = ?', [employeeId, isoDate()])
    : [[]];
  const [[attStats]] = canViewOwnAttendance ? await pool.query(`
    SELECT COUNT(*) AS days,
           COALESCE(SUM(status IN ('present','late','remote','half-day')), 0) AS attended,
           COALESCE(SUM(status = 'late'), 0) AS late,
           COALESCE(SUM(status = 'absent'), 0) AS absent,
           COALESCE(ROUND(AVG(NULLIF(work_hours, 0)), 1), 0) AS avg_hours
    FROM hrm_attendance
    WHERE employee_id = ? AND date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
  `, [employeeId]) : [[{ days: 0, attended: 0, late: 0, absent: 0, avg_hours: 0 }]];
  const [[leaveRow]] = canViewOwnLeave ? await pool.query(`
    SELECT COALESCE(SUM(status = 'pending'), 0) AS pending,
           COALESCE(SUM(CASE WHEN status = 'approved' AND type = 'annual' AND YEAR(start_date) = YEAR(CURDATE()) THEN days END), 0) AS annual_used,
           COALESCE(SUM(CASE WHEN status = 'approved' AND type = 'sick' AND YEAR(start_date) = YEAR(CURDATE()) THEN days END), 0) AS sick_used
    FROM hrm_leaves WHERE employee_id = ?
  `, [employeeId]) : [[{ pending: 0, annual_used: 0, sick_used: 0 }]];
  const [latestPayroll] = canViewOwnPayroll ? await pool.query(
    'SELECT * FROM hrm_payroll WHERE employee_id = ? ORDER BY month DESC LIMIT 1',
    [employeeId]
  ) : [[]];
  const [upcomingLeaves] = canViewOwnLeave ? await pool.query(`
    SELECT * FROM hrm_leaves
    WHERE employee_id = ? AND status IN ('pending','approved') AND end_date >= CURDATE()
    ORDER BY start_date LIMIT 3
  `, [employeeId]) : [[]];
  const [[teamRow]] = await pool.query(
    `SELECT COUNT(*) AS count FROM hrm_employees WHERE department_id = ? AND id <> ? AND status <> 'inactive'`,
    [employee.department_id, employeeId]
  );
  const [[birthdayRow]] = await pool.query(`
    SELECT COUNT(*) AS count FROM hrm_employees
    WHERE department_id = ? AND MONTH(date_of_birth) = MONTH(CURDATE()) AND id <> ?
  `, [employee.department_id, employeeId]);

  const days = Number(attStats.days);
  const attended = Number(attStats.attended);
  const annualTotal = 24;
  const annualUsed = Number(leaveRow.annual_used);

  res.json({
    role: 'employee',
    employee,
    my: {
      today: todayRows[0] || null,
      todayDate: isoDate(),
      attendanceRate: days ? Math.round((attended / days) * 100) : 100,
      daysRecorded: days,
      attended,
      late: Number(attStats.late),
      absent: Number(attStats.absent),
      avgHours: Number(attStats.avg_hours),
      leave: {
        pending: Number(leaveRow.pending),
        annualTotal,
        annualUsed,
        annualRemaining: Math.max(0, annualTotal - annualUsed),
        sickUsed: Number(leaveRow.sick_used),
      },
      latestPayroll: latestPayroll[0] || null,
      upcomingLeaves,
      teamSize: Number(teamRow.count),
      birthdays: Number(birthdayRow.count),
      month: currentMonth,
    },
  });
}

export default router;

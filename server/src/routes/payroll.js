import { Router } from 'express';
import pool from '../db.js';
import { asyncHandler, ApiError, isoDate, monthKey, pad } from '../utils.js';
import { authenticate, requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { audit } from '../audit.js';

const router = Router();
router.use(authenticate);

const SELECT = `
  SELECT p.*, e.first_name, e.last_name, e.employee_code, e.designation, e.avatar_color,
         e.salary AS annual_salary, d.name AS department_name, d.color AS department_color
  FROM hrm_payroll p
  JOIN hrm_employees e ON e.id = p.employee_id
  LEFT JOIN hrm_departments d ON d.id = e.department_id
`;

const monthRange = (month) => {
  const [y, m] = month.split('-').map(Number);
  return { first: `${y}-${pad(m)}-01`, last: isoDate(new Date(y, m, 0)) };
};

router.get(
  '/',
  requireAnyPermission('payroll.view_all', 'payroll.self'),
  asyncHandler(async (req, res) => {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : monthKey();
    const where = ['p.month = ?'];
    const params = [month];
    const canViewAll = req.permissions.includes('payroll.view_all');

    if (!canViewAll) {
      where.push('p.employee_id = ?');
      params.push(req.user.employeeId || 0);
    } else if (req.query.employeeId) {
      where.push('p.employee_id = ?');
      params.push(Number(req.query.employeeId));
    }
    if (req.query.departmentId) {
      where.push('e.department_id = ?');
      params.push(Number(req.query.departmentId));
    }
    if (req.query.status) {
      where.push('p.status = ?');
      params.push(req.query.status);
    }

    const [rows] = await pool.query(
      `${SELECT} WHERE ${where.join(' AND ')} ORDER BY p.net_pay DESC`,
      params
    );

    const totals = rows.reduce(
      (acc, r) => {
        acc.gross += Number(r.basic) + Number(r.allowances) + Number(r.bonus);
        acc.deductions += Number(r.deductions);
        acc.net += Number(r.net_pay);
        acc.count += 1;
        if (r.status === 'paid') acc.paid += 1;
        else acc.pending += 1;
        return acc;
      },
      { gross: 0, deductions: 0, net: 0, count: 0, paid: 0, pending: 0 }
    );

    res.json({ data: rows, totals, month });
  })
);

router.get(
  '/:id/payslip',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`${SELECT} WHERE p.id = ?`, [req.params.id]);
    const slip = rows[0];
    if (!slip) throw new ApiError(404, 'Payslip not found.');
    if (!req.permissions.includes('payroll.view_all') && slip.employee_id !== req.user.employeeId)
      throw new ApiError(403, 'You can only view your own payslips.');
    const [employee] = await pool.query(
      'SELECT * FROM hrm_employees WHERE id = ?',
      [slip.employee_id]
    );
    res.json({ payslip: slip, employee: employee[0] });
  })
);

router.post(
  '/generate',
  requirePermission('payroll.manage'),
  asyncHandler(async (req, res) => {
    const month = req.body?.month;
    if (!/^\d{4}-\d{2}$/.test(month || '')) throw new ApiError(400, 'Choose a valid payroll month.');
    const { first, last } = monthRange(month);

    const [employees] = await pool.query(
      `SELECT id, salary FROM hrm_employees
       WHERE status <> 'inactive' AND join_date <= ?`,
      [last]
    );
    if (!employees.length) throw new ApiError(400, 'No eligible employees found for that month.');

    let created = 0;
    for (const emp of employees) {
      const monthly = Math.round(Number(emp.salary) / 12);
      const allowances = Math.round(monthly * 0.12);
      const deductions = Math.round(monthly * 0.08);
      const net = monthly + allowances - deductions;
      const [r] = await pool.query(
        `INSERT IGNORE INTO hrm_payroll (employee_id, month, basic, allowances, bonus, deductions, net_pay, status)
         VALUES (?,?,?,?,0,?,?, 'pending')`,
        [emp.id, month, monthly, allowances, deductions, net]
      );
      created += r.affectedRows;
    }

    await audit(req, {
      action: 'payroll.generate',
      entity: 'payroll',
      entityId: month,
      details: { month, created },
    });

    res.json({
      message: created
        ? `Payroll generated for ${created} employee${created === 1 ? '' : 's'}.`
        : 'Payroll already exists for every eligible employee this month.',
      created,
      month,
      first,
    });
  })
);

router.patch(
  '/:id/pay',
  requirePermission('payroll.manage'),
  asyncHandler(async (req, res) => {
    const [r] = await pool.query(
      `UPDATE hrm_payroll SET status = 'paid', paid_at = NOW() WHERE id = ?`,
      [req.params.id]
    );
    if (!r.affectedRows) throw new ApiError(404, 'Payslip not found.');
    await audit(req, {
      action: 'payroll.pay',
      entity: 'payroll',
      entityId: req.params.id,
      details: { month: req.body?.month || null },
    });
    res.json({ message: 'Marked as paid.' });
  })
);

export default router;

import bcrypt from 'bcryptjs';
import { Router } from 'express';
import pool from '../db.js';
import { asyncHandler, ApiError } from '../utils.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { audit } from '../audit.js';
import { EMPLOYEE_FIELDS as FIELDS, EMPLOYEE_SELECT as SELECT, insertEmployee } from '../services/employees.js';
import { isKnownRole } from '../permissions.js';

const router = Router();
router.use(authenticate);

router.get(
  '/options',
  requirePermission('employees.view'),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT e.id, e.employee_code, e.first_name, e.last_name, e.designation, e.avatar_color, e.department_id,
              d.name AS department_name
       FROM hrm_employees e LEFT JOIN hrm_departments d ON d.id = e.department_id
       WHERE e.status <> 'inactive' ORDER BY e.first_name`
    );
    res.json({ data: rows });
  })
);

router.get(
  '/',
  requirePermission('employees.view'),
  asyncHandler(async (req, res) => {
    const { search = '', department = '', status = '', sort = 'newest' } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 9));
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];
    if (search.trim()) {
      where.push('(e.first_name LIKE ? OR e.last_name LIKE ? OR e.email LIKE ? OR e.employee_code LIKE ? OR e.designation LIKE ? OR CONCAT(e.first_name, " ", e.last_name) LIKE ?)');
      const q = `%${search.trim()}%`;
      params.push(q, q, q, q, q, q);
    }
    if (department) {
      where.push('e.department_id = ?');
      params.push(Number(department));
    }
    if (status) {
      where.push('e.status = ?');
      params.push(status);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderBy =
      sort === 'name'
        ? 'e.first_name ASC, e.last_name ASC'
        : sort === 'oldest'
          ? 'e.join_date ASC'
          : 'e.join_date DESC, e.id DESC';

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM hrm_employees e ${clause}`,
      params
    );
    const [data] = await pool.query(
      `${SELECT} ${clause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    if (!req.permissions.includes('payroll.view_all')) {
      for (const row of data) delete row.salary;
    }

    const [[stats]] = await pool.query(`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(status = 'active'), 0) AS active,
             COALESCE(SUM(status = 'on-leave'), 0) AS on_leave,
             COALESCE(SUM(status = 'probation'), 0) AS probation,
             COALESCE(SUM(join_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')), 0) AS new_this_month
      FROM hrm_employees
    `);

    res.json({
      data,
      pagination: { page, limit, total: Number(countRow.total), pages: Math.ceil(countRow.total / limit) || 1 },
      stats,
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!req.permissions.includes('employees.view') && req.user.employeeId !== id)
      throw new ApiError(403, 'You can only view your own profile.');

    const [rows] = await pool.query(`${SELECT} WHERE e.id = ?`, [id]);
    if (!rows[0]) throw new ApiError(404, 'Employee not found.');

    const [attendance] = await pool.query(
      `SELECT * FROM hrm_attendance WHERE employee_id = ? ORDER BY date DESC LIMIT 8`,
      [id]
    );
    const [[attStats]] = await pool.query(
      `SELECT COUNT(*) AS days,
              COALESCE(SUM(status IN ('present','late','remote','half-day')), 0) AS attended,
              COALESCE(SUM(status = 'late'), 0) AS late,
              COALESCE(SUM(status = 'absent'), 0) AS absent,
              COALESCE(ROUND(AVG(NULLIF(work_hours, 0)), 1), 0) AS avg_hours
       FROM hrm_attendance
       WHERE employee_id = ? AND date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
      [id]
    );
    const [leaves] = await pool.query(
      `SELECT * FROM hrm_leaves WHERE employee_id = ? ORDER BY created_at DESC LIMIT 8`,
      [id]
    );
    const [payroll] = await pool.query(
      `SELECT * FROM hrm_payroll WHERE employee_id = ? ORDER BY month DESC LIMIT 6`,
      [id]
    );
    const [leaveTotals] = await pool.query(
      `SELECT type, COALESCE(SUM(days), 0) AS days FROM hrm_leaves
       WHERE employee_id = ? AND status = 'approved' AND YEAR(start_date) = YEAR(CURDATE())
       GROUP BY type`,
      [id]
    );

    const canViewPay = req.permissions.includes('payroll.view_all') || req.user.employeeId === id;
    if (!canViewPay) {
      delete rows[0].salary;
    }

    res.json({
      employee: rows[0],
      attendance,
      attendanceStats: attStats,
      leaves,
      payroll: canViewPay ? payroll : [],
      leaveTotals,
    });
  })
);

router.post(
  '/',
  requirePermission('employees.manage'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const created = await insertEmployee(pool, body);
    const [rows] = await pool.query(`${SELECT} WHERE e.id = ?`, [created.id]);

    // If initial login credentials were provided by HR/Admin during creation
    if (body.create_login && body.password) {
      const loginPassword = String(body.password);
      if (loginPassword.length < 8) {
        throw new ApiError(400, 'Login password must be at least 8 characters.');
      }
      // HR provisioning strictly creates 'employee' accounts to prevent privilege escalation
      const loginRole = 'employee';
      const fullName = `${body.first_name} ${body.last_name}`.trim();
      const loginEmail = String(body.email).trim().toLowerCase();
      const hash = await bcrypt.hash(loginPassword, 10);

      await pool.query(
        `INSERT INTO hrm_users (name, email, password_hash, role, employee_id, avatar_color, is_active)
         VALUES (?,?,?,?,?,?,1)`,
        [fullName, loginEmail, hash, loginRole, created.id, body.avatar_color || 'indigo']
      );

      await audit(req, {
        action: 'user.create',
        entity: 'user',
        details: { name: fullName, email: loginEmail, role: loginRole, employeeId: created.id },
      });
    }

    await audit(req, {
      action: 'employee.create',
      entity: 'employee',
      entityId: created.id,
      details: { name: `${body.first_name} ${body.last_name}`, email: body.email, code: created.employeeCode },
    });
    res.status(201).json({ employee: rows[0], message: 'Employee added successfully.' });
  })
);

router.put(
  '/:id',
  requirePermission('employees.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body || {};
    const sets = [];
    const params = [];
    for (const f of FIELDS) {
      if (body[f] === undefined) continue;
      sets.push(`${f} = ?`);
      let v = body[f];
      if (v === '') v = null;
      if (f === 'salary') v = Number(v) || 0;
      if (f === 'department_id') v = Number(v) || null;
      params.push(v);
    }
    if (!sets.length) throw new ApiError(400, 'Nothing to update.');
    params.push(id);
    try {
      const [result] = await pool.query(
        `UPDATE hrm_employees SET ${sets.join(', ')} WHERE id = ?`,
        params
      );
      if (!result.affectedRows) throw new ApiError(404, 'Employee not found.');
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'That email is already in use.');
      throw err;
    }
    const [rows] = await pool.query(`${SELECT} WHERE e.id = ?`, [id]);
    await audit(req, {
      action: 'employee.update',
      entity: 'employee',
      entityId: id,
      details: { fields: Object.keys(body) },
    });
    res.json({ employee: rows[0], message: 'Employee updated.' });
  })
);

router.delete(
  '/:id',
  requirePermission('employees.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (req.user.employeeId === id) throw new ApiError(400, 'You cannot delete your own employee record.');
    const [users] = await pool.query('SELECT id FROM hrm_users WHERE employee_id = ?', [id]);
    if (users.length)
      throw new ApiError(400, 'This employee has a login account. Deactivate them instead of deleting.');
    const [[existing]] = await pool.query('SELECT first_name, last_name FROM hrm_employees WHERE id = ?', [id]);
    const [result] = await pool.query('DELETE FROM hrm_employees WHERE id = ?', [id]);
    if (!result.affectedRows) throw new ApiError(404, 'Employee not found.');
    await audit(req, {
      action: 'employee.delete',
      entity: 'employee',
      entityId: id,
      details: existing ? { name: `${existing.first_name} ${existing.last_name}` } : null,
    });
    res.json({ message: 'Employee removed.' });
  })
);

export default router;

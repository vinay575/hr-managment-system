import { Router } from 'express';
import pool from '../db.js';
import { asyncHandler, ApiError, isoDate, isoTime, pad } from '../utils.js';
import { authenticate, requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { audit } from '../audit.js';

const router = Router();
router.use(authenticate);

const hoursBetween = (start, end) => {
  if (!start || !end) return 0;
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  if (mins > 360) mins -= 60; // lunch break
  return Number((mins / 60).toFixed(1));
};

const SELECT = `
  SELECT a.*, e.first_name, e.last_name, e.employee_code, e.designation, e.avatar_color,
         d.name AS department_name, d.color AS department_color
  FROM hrm_attendance a
  JOIN hrm_employees e ON e.id = a.employee_id
  LEFT JOIN hrm_departments d ON d.id = e.department_id
`;

router.get(
  '/me/today',
  requireAnyPermission('attendance.self', 'attendance.manage'),
  asyncHandler(async (req, res) => {
    if (!req.user.employeeId) return res.json({ record: null });
    const [rows] = await pool.query(
      `${SELECT} WHERE a.employee_id = ? AND a.date = ?`,
      [req.user.employeeId, isoDate()]
    );
    res.json({ record: rows[0] || null, now: isoTime() });
  })
);

router.get(
  '/',
  requireAnyPermission('attendance.view_all', 'attendance.self'),
  asyncHandler(async (req, res) => {
    const { date = '', month = '', status = '', employeeId = '', departmentId = '' } = req.query;
    const where = [];
    const params = [];
    const canViewAll = req.permissions.includes('attendance.view_all');

    if (!canViewAll) {
      where.push('a.employee_id = ?');
      params.push(req.user.employeeId || 0);
    } else if (employeeId) {
      where.push('a.employee_id = ?');
      params.push(Number(employeeId));
    }
    if (departmentId) {
      where.push('e.department_id = ?');
      params.push(Number(departmentId));
    }
    if (status) {
      where.push('a.status = ?');
      params.push(status);
    }

    let rangeLabel;
    if (date) {
      where.push('a.date = ?');
      params.push(date);
      rangeLabel = date;
    } else {
      const m = month || isoDate().slice(0, 7);
      const [y, mo] = m.split('-').map(Number);
      const first = `${y}-${pad(mo)}-01`;
      const last = isoDate(new Date(y, mo, 0));
      where.push('a.date BETWEEN ? AND ?');
      params.push(first, last);
      rangeLabel = m;
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.query(`${SELECT} ${clause} ORDER BY a.date DESC, e.first_name ASC`, params);

    const summary = rows.reduce(
      (acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        acc.total += 1;
        return acc;
      },
      { total: 0, present: 0, late: 0, remote: 0, absent: 0, 'half-day': 0 }
    );

    res.json({ data: rows, summary, range: rangeLabel });
  })
);

router.post(
  '/check-in',
  requireAnyPermission('attendance.self', 'attendance.manage'),
  asyncHandler(async (req, res) => {
    const requestedId = Number(req.body?.employeeId || req.user.employeeId);
    if (requestedId && requestedId !== req.user.employeeId && !req.permissions.includes('attendance.manage'))
      throw new ApiError(403, 'You can only clock in for yourself.');
    const employeeId = requestedId;
    if (!employeeId) throw new ApiError(400, 'No employee profile is linked to this account.');
    const date = isoDate();
    const [existing] = await pool.query(
      'SELECT id FROM hrm_attendance WHERE employee_id = ? AND date = ?',
      [employeeId, date]
    );
    if (existing.length) throw new ApiError(409, 'You have already checked in today.');

    const now = new Date();
    const checkIn = isoTime(now);
    const late = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 15);
    const status = late ? 'late' : 'present';
    await pool.query(
      `INSERT INTO hrm_attendance (employee_id, date, check_in, status, work_hours)
       VALUES (?,?,?,?,0)`,
      [employeeId, date, checkIn, status]
    );
    const [rows] = await pool.query(`${SELECT} WHERE a.employee_id = ? AND a.date = ?`, [employeeId, date]);
    res.status(201).json({ record: rows[0], message: late ? 'Checked in — marked as late.' : 'Checked in. Have a great day!' });
  })
);

router.post(
  '/check-out',
  requireAnyPermission('attendance.self', 'attendance.manage'),
  asyncHandler(async (req, res) => {
    const requestedId = Number(req.body?.employeeId || req.user.employeeId);
    if (requestedId && requestedId !== req.user.employeeId && !req.permissions.includes('attendance.manage'))
      throw new ApiError(403, 'You can only clock out for yourself.');
    const employeeId = requestedId;
    if (!employeeId) throw new ApiError(400, 'No employee profile is linked to this account.');
    const date = isoDate();
    const [rows] = await pool.query(
      'SELECT * FROM hrm_attendance WHERE employee_id = ? AND date = ?',
      [employeeId, date]
    );
    if (!rows[0]) throw new ApiError(400, 'You need to check in first.');
    if (rows[0].check_out) throw new ApiError(409, 'You have already checked out today.');

    const checkOut = isoTime();
    const workHours = hoursBetween(rows[0].check_in, checkOut);
    await pool.query('UPDATE hrm_attendance SET check_out = ?, work_hours = ? WHERE id = ?', [
      checkOut,
      workHours,
      rows[0].id,
    ]);
    const [updated] = await pool.query(`${SELECT} WHERE a.id = ?`, [rows[0].id]);
    res.json({ record: updated[0], message: `Checked out. ${workHours}h logged today.` });
  })
);

router.post(
  '/mark',
  requirePermission('attendance.manage'),
  asyncHandler(async (req, res) => {
    const { employee_id, date, status, check_in, check_out, notes } = req.body || {};
    if (!employee_id || !date || !status) throw new ApiError(400, 'Employee, date and status are required.');
    const hours = check_in && check_out ? hoursBetween(check_in, check_out) : 0;
    await pool.query(
      `INSERT INTO hrm_attendance (employee_id, date, check_in, check_out, status, work_hours, notes)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE check_in = VALUES(check_in), check_out = VALUES(check_out),
         status = VALUES(status), work_hours = VALUES(work_hours), notes = VALUES(notes)`,
      [employee_id, date, check_in || null, check_out || null, status, hours, notes || null]
    );
    await audit(req, {
      action: 'attendance.mark',
      entity: 'attendance',
      entityId: `${employee_id}:${date}`,
      details: { employee_id, date, status, check_in: check_in || null, check_out: check_out || null },
    });
    res.json({ message: 'Attendance saved.' });
  })
);

export default router;

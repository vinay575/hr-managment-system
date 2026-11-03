import { Router } from 'express';
import pool from '../db.js';
import { asyncHandler, ApiError, isoDate } from '../utils.js';
import { authenticate, requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { audit } from '../audit.js';

const router = Router();
router.use(authenticate);

const TYPES = ['annual', 'sick', 'personal', 'maternity', 'unpaid'];
const ANNUAL_ALLOWANCE = 24;

const SELECT = `
  SELECT l.*, e.first_name, e.last_name, e.employee_code, e.designation, e.avatar_color,
         d.name AS department_name, d.color AS department_color,
         CONCAT(r.first_name, ' ', r.last_name) AS reviewer_name
  FROM hrm_leaves l
  JOIN hrm_employees e ON e.id = l.employee_id
  LEFT JOIN hrm_departments d ON d.id = e.department_id
  LEFT JOIN hrm_employees r ON r.id = l.reviewed_by
`;

router.get(
  '/',
  requireAnyPermission('leaves.view_all', 'leaves.self'),
  asyncHandler(async (req, res) => {
    const { status = '', type = '', employeeId = '', scope = '' } = req.query;
    const where = [];
    const params = [];

    const canViewAll = req.permissions.includes('leaves.view_all');
    const ownOnly = !canViewAll || scope === 'me';
    if (ownOnly) {
      where.push('l.employee_id = ?');
      params.push(req.user.employeeId || 0);
    } else if (employeeId) {
      where.push('l.employee_id = ?');
      params.push(Number(employeeId));
    }
    if (status) {
      where.push('l.status = ?');
      params.push(status);
    }
    if (type) {
      where.push('l.type = ?');
      params.push(type);
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.query(`${SELECT} ${clause} ORDER BY FIELD(l.status,'pending','approved','rejected','cancelled'), l.created_at DESC`, params);

    let stats = null;
    if (!ownOnly) {
      const [[row]] = await pool.query(`
        SELECT COUNT(*) AS total,
               COALESCE(SUM(status = 'pending'), 0) AS pending,
               COALESCE(SUM(status = 'approved'), 0) AS approved,
               COALESCE(SUM(status = 'rejected'), 0) AS rejected
        FROM hrm_leaves
      `);
      stats = row;
    }

    let balance = null;
    if (req.user.employeeId) {
      const [[used]] = await pool.query(
        `SELECT COALESCE(SUM(days), 0) AS annual_used,
                COALESCE(SUM(CASE WHEN type = 'sick' THEN days END), 0) AS sick_used
         FROM hrm_leaves
         WHERE employee_id = ? AND status = 'approved' AND YEAR(start_date) = YEAR(CURDATE())`,
        [req.user.employeeId]
      );
      balance = {
        annualTotal: ANNUAL_ALLOWANCE,
        annualUsed: Number(used.annual_used),
        annualRemaining: Math.max(0, ANNUAL_ALLOWANCE - Number(used.annual_used)),
        sickUsed: Number(used.sick_used),
      };
    }

    res.json({ data: rows, stats, balance });
  })
);

router.post(
  '/',
  requireAnyPermission('leaves.self', 'leaves.manage'),
  asyncHandler(async (req, res) => {
    const { type, startDate, endDate, reason } = req.body || {};
    let employeeId = req.user.employeeId;
    if (req.body.employeeId && Number(req.body.employeeId) !== req.user.employeeId) {
      if (!req.permissions.includes('leaves.manage'))
        throw new ApiError(403, 'You can only apply for your own leave.');
      employeeId = Number(req.body.employeeId);
    }
    if (!employeeId) throw new ApiError(400, 'No employee profile is linked to this account.');
    if (!TYPES.includes(type)) throw new ApiError(400, 'Please choose a valid leave type.');
    if (!startDate || !endDate) throw new ApiError(400, 'Start and end dates are required.');
    if (new Date(startDate) > new Date(endDate)) throw new ApiError(400, 'End date cannot be before start date.');
    if (new Date(startDate) < new Date(isoDate()) && req.user.role === 'employee')
      throw new ApiError(400, 'Leave cannot start in the past.');

    const days = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
    if (days > 60) throw new ApiError(400, 'A single leave request cannot exceed 60 days.');

    const [overlap] = await pool.query(
      `SELECT id FROM hrm_leaves
       WHERE employee_id = ? AND status IN ('pending','approved')
         AND start_date <= ? AND end_date >= ?`,
      [employeeId, endDate, startDate]
    );
    if (overlap.length) throw new ApiError(409, 'You already have a leave request for those dates.');

    const [r] = await pool.query(
      `INSERT INTO hrm_leaves (employee_id, type, start_date, end_date, days, reason, status)
       VALUES (?,?,?,?,?,?, 'pending')`,
      [employeeId, type, startDate, endDate, days, reason || null]
    );
    const [rows] = await pool.query(`${SELECT} WHERE l.id = ?`, [r.insertId]);
    res.status(201).json({ leave: rows[0], message: 'Leave request submitted for approval.' });
  })
);

router.patch(
  '/:id/status',
  requirePermission('leaves.manage'),
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!['approved', 'rejected'].includes(status))
      throw new ApiError(400, 'Status must be approved or rejected.');

    const [result] = await pool.query(
      `UPDATE hrm_leaves SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ? AND status = 'pending'`,
      [status, req.user.employeeId || null, req.params.id]
    );
    if (!result.affectedRows) throw new ApiError(400, 'This request is no longer pending.');

    const [rows] = await pool.query(`${SELECT} WHERE l.id = ?`, [req.params.id]);
    await audit(req, {
      action: `leave.${status}`,
      entity: 'leave',
      entityId: req.params.id,
      details: {
        employee: rows[0] ? `${rows[0].first_name} ${rows[0].last_name}` : null,
        type: rows[0]?.type,
        days: rows[0]?.days,
      },
    });
    res.json({ leave: rows[0], message: `Leave ${status}.` });
  })
);

router.delete(
  '/:id',
  requireAnyPermission('leaves.self', 'leaves.manage'),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM hrm_leaves WHERE id = ?', [req.params.id]);
    const leave = rows[0];
    if (!leave) throw new ApiError(404, 'Leave request not found.');
    if (!req.permissions.includes('leaves.manage') && leave.employee_id !== req.user.employeeId)
      throw new ApiError(403, 'You can only cancel your own requests.');
    if (leave.status !== 'pending') throw new ApiError(400, 'Only pending requests can be cancelled.');

    await pool.query("UPDATE hrm_leaves SET status = 'cancelled' WHERE id = ?", [req.params.id]);
    res.json({ message: 'Leave request cancelled.' });
  })
);

export default router;

import { Router } from 'express';
import pool from '../db.js';
import { asyncHandler } from '../utils.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { ROLE_LABELS } from '../permissions.js';

const router = Router();
router.use(authenticate);
router.use(requirePermission('audit.view'));

const ACTIONS = [
  'employee.create', 'employee.update', 'employee.delete',
  'department.create', 'department.update', 'department.delete',
  'attendance.mark',
  'leave.approved', 'leave.rejected',
  'payroll.generate', 'payroll.pay',
  'user.create', 'user.update', 'user.role_change', 'user.activate', 'user.deactivate',
  'user.password_reset', 'user.delete',
  'permissions.update',
];

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
    const { action = '', role = '', search = '' } = req.query;

    const where = [];
    const params = [];

    if (action) {
      where.push('action LIKE ?');
      params.push(`%${action}%`);
    }
    if (role) {
      where.push('actor_role = ?');
      params.push(role);
    }
    if (search) {
      where.push('(actor_name LIKE ? OR action LIKE ? OR entity LIKE ? OR entity_id LIKE ? OR details LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM hrm_audit_logs ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT * FROM hrm_audit_logs ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );

    res.json({
      data: rows.map((row) => ({
        ...row,
        actor_role_label: ROLE_LABELS[row.actor_role] || row.actor_role,
        details: (() => {
          if (!row.details) return null;
          if (typeof row.details === 'object') return row.details;
          try {
            return JSON.parse(row.details);
          } catch {
            return { raw: row.details };
          }
        })(),
      })),
      total: Number(countRow.total),
      page,
      limit,
      actions: ACTIONS,
    });
  })
);

export default router;

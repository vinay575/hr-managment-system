import { Router } from 'express';
import pool from '../db.js';
import { asyncHandler, ApiError } from '../utils.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { audit } from '../audit.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  requirePermission('departments.view'),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`
      SELECT d.id, d.name, d.description, d.color, d.head_id, d.created_at,
             CONCAT(h.first_name, ' ', h.last_name) AS head_name,
             h.avatar_color AS head_color,
             COUNT(DISTINCT e.id) AS employee_count,
             COALESCE(SUM(e.salary), 0) AS payroll_total,
             COALESCE(ROUND(AVG(e.salary), 0), 0) AS avg_salary
      FROM hrm_departments d
      LEFT JOIN hrm_employees h ON h.id = d.head_id
      LEFT JOIN hrm_employees e ON e.department_id = d.id AND e.status <> 'inactive'
      GROUP BY d.id, d.name, d.description, d.color, d.head_id, d.created_at, h.first_name, h.last_name, h.avatar_color
      ORDER BY d.name
    `);
    if (!req.permissions.includes('payroll.view_all')) {
      for (const row of rows) {
        delete row.payroll_total;
        delete row.avg_salary;
      }
    }
    res.json({ data: rows });
  })
);

router.get(
  '/:id',
  requirePermission('departments.view'),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT d.*, CONCAT(h.first_name, ' ', h.last_name) AS head_name
       FROM hrm_departments d LEFT JOIN hrm_employees h ON h.id = d.head_id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, 'Department not found.');
    const [members] = await pool.query(
      `SELECT id, employee_code, first_name, last_name, designation, email, status, avatar_color
       FROM hrm_employees WHERE department_id = ? ORDER BY first_name`,
      [req.params.id]
    );
    res.json({ department: rows[0], members });
  })
);

router.post(
  '/',
  requirePermission('departments.manage'),
  asyncHandler(async (req, res) => {
    const { name, description, color, head_id } = req.body || {};
    if (!name?.trim()) throw new ApiError(400, 'Department name is required.');
    try {
      const [r] = await pool.query(
        'INSERT INTO hrm_departments (name, description, color, head_id) VALUES (?,?,?,?)',
        [name.trim(), description || null, color || 'indigo', head_id ? Number(head_id) : null]
      );
      await audit(req, {
        action: 'department.create',
        entity: 'department',
        entityId: r.insertId,
        details: { name: name.trim() },
      });
      res.status(201).json({ id: r.insertId, message: 'Department created.' });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'A department with that name already exists.');
      throw e;
    }
  })
);

router.put(
  '/:id',
  requirePermission('departments.manage'),
  asyncHandler(async (req, res) => {
    const { name, description, color, head_id } = req.body || {};
    const [r] = await pool.query(
      `UPDATE hrm_departments SET name = COALESCE(?, name), description = COALESCE(?, description),
              color = COALESCE(?, color), head_id = ? WHERE id = ?`,
      [name || null, description ?? null, color || null, head_id ? Number(head_id) : null, req.params.id]
    );
    if (!r.affectedRows) throw new ApiError(404, 'Department not found.');
    await audit(req, {
      action: 'department.update',
      entity: 'department',
      entityId: req.params.id,
      details: { fields: Object.keys(req.body || {}) },
    });
    res.json({ message: 'Department updated.' });
  })
);

router.delete(
  '/:id',
  requirePermission('departments.manage'),
  asyncHandler(async (req, res) => {
    const [[row]] = await pool.query(
      'SELECT COUNT(*) AS count FROM hrm_employees WHERE department_id = ?',
      [req.params.id]
    );
    if (Number(row.count) > 0)
      throw new ApiError(400, 'Move team members to another department before deleting this one.');
    const [[existing]] = await pool.query('SELECT name FROM hrm_departments WHERE id = ?', [req.params.id]);
    const [r] = await pool.query('DELETE FROM hrm_departments WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) throw new ApiError(404, 'Department not found.');
    await audit(req, {
      action: 'department.delete',
      entity: 'department',
      entityId: req.params.id,
      details: existing ? { name: existing.name } : null,
    });
    res.json({ message: 'Department deleted.' });
  })
);

export default router;

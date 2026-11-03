import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { asyncHandler, ApiError } from '../utils.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { audit } from '../audit.js';
import { isKnownRole, PERMISSION_KEYS, ROLES, ROLE_LABELS } from '../permissions.js';

const router = Router();
router.use(authenticate);
router.use(requirePermission('users.manage'));

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const SELECT = `
  SELECT u.id, u.name, u.email, u.role, u.employee_id, u.avatar_color, u.is_active,
         u.last_login, u.created_at, e.employee_code,
         CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
         e.designation, d.name AS department_name
  FROM hrm_users u
  LEFT JOIN hrm_employees e ON e.id = u.employee_id
  LEFT JOIN hrm_departments d ON d.id = e.department_id
`;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `${SELECT} ORDER BY FIELD(u.role,'super_admin','ceo','administration','hr','employee'), u.name`
    );
    res.json({
      data: rows.map((u) => ({ ...u, is_active: Number(u.is_active) === 1, role_label: ROLE_LABELS[u.role] || u.role })),
      roles: ROLES,
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, email, password, role = 'employee', employee_id = null, avatar_color = 'indigo' } = req.body || {};
    if (!name?.trim()) throw new ApiError(400, 'Full name is required.');
    if (!email || !EMAIL_RE.test(String(email))) throw new ApiError(400, 'Please enter a valid email address.');
    if (!isKnownRole(role)) throw new ApiError(400, 'Please choose a valid role.');
    if (!password || String(password).length < 8) throw new ApiError(400, 'Password must be at least 8 characters.');

    // If an HR manager is creating the user, restrict them strictly to provisioning 'employee' roles
    const canManageRoles = req.permissions.includes('roles.manage');
    const assignedRole = canManageRoles ? role : 'employee';

    const empId = employee_id ? Number(employee_id) : null;
    if (empId) {
      const [taken] = await pool.query('SELECT id FROM hrm_users WHERE employee_id = ? LIMIT 1', [empId]);
      if (taken.length) throw new ApiError(409, 'That employee already has a login account.');
    }

    try {
      const hash = await bcrypt.hash(String(password), 10);
      const [result] = await pool.query(
        `INSERT INTO hrm_users (name, email, password_hash, role, employee_id, avatar_color, is_active)
         VALUES (?,?,?,?,?,?,1)`,
        [name.trim(), String(email).trim().toLowerCase(), hash, assignedRole, empId, avatar_color]
      );
      await audit(req, {
        action: 'user.create',
        entity: 'user',
        entityId: result.insertId,
        details: { name: name.trim(), email: String(email).toLowerCase(), role: assignedRole },
      });
      const [rows] = await pool.query(`${SELECT} WHERE u.id = ?`, [result.insertId]);
      res.status(201).json({ user: { ...rows[0], is_active: Number(rows[0].is_active) === 1 }, message: 'User account created.' });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'That email is already in use.');
      throw err;
    }
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [rows] = await pool.query('SELECT * FROM hrm_users WHERE id = ?', [id]);
    const target = rows[0];
    if (!target) throw new ApiError(404, 'User not found.');

    const body = req.body || {};
    if (body.role !== undefined && !isKnownRole(body.role)) throw new ApiError(400, 'Please choose a valid role.');
    if (body.email !== undefined && !EMAIL_RE.test(String(body.email)))
      throw new ApiError(400, 'Please enter a valid email address.');
    if (body.name !== undefined && !String(body.name).trim()) throw new ApiError(400, 'Name cannot be empty.');

    const nextRole = body.role ?? target.role;
    const nextActive = body.is_active === undefined ? Number(target.is_active) === 1 : Boolean(body.is_active);

    if (id === req.user.id && !nextActive) throw new ApiError(400, 'You cannot deactivate your own account.');
    if (target.role === 'super_admin' && (nextRole !== 'super_admin' || !nextActive)) {
      const [[countRow]] = await pool.query(
        "SELECT COUNT(*) AS count FROM hrm_users WHERE role = 'super_admin' AND is_active = 1"
      );
      if (Number(countRow.count) <= 1)
        throw new ApiError(400, 'At least one active Super Admin must remain.');
    }

    if (body.employee_id !== undefined && body.employee_id) {
      const [taken] = await pool.query(
        'SELECT id FROM hrm_users WHERE employee_id = ? AND id <> ? LIMIT 1',
        [Number(body.employee_id), id]
      );
      if (taken.length) throw new ApiError(409, 'That employee already has a login account.');
    }

    const sets = [];
    const params = [];
    const map = {
      name: body.name !== undefined ? String(body.name).trim() : undefined,
      email: body.email !== undefined ? String(body.email).trim().toLowerCase() : undefined,
      role: body.role !== undefined ? body.role : undefined,
      employee_id: body.employee_id !== undefined ? (body.employee_id ? Number(body.employee_id) : null) : undefined,
      avatar_color: body.avatar_color !== undefined ? body.avatar_color : undefined,
      is_active: body.is_active !== undefined ? (body.is_active ? 1 : 0) : undefined,
    };
    for (const [key, value] of Object.entries(map)) {
      if (value === undefined) continue;
      sets.push(`${key} = ?`);
      params.push(value);
    }
    if (!sets.length) throw new ApiError(400, 'Nothing to update.');
    params.push(id);

    try {
      await pool.query(`UPDATE hrm_users SET ${sets.join(', ')} WHERE id = ?`, params);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'That email is already in use.');
      throw err;
    }

    await audit(req, {
      action: body.is_active !== undefined && nextActive !== (Number(target.is_active) === 1)
        ? nextActive ? 'user.activate' : 'user.deactivate'
        : nextRole !== target.role ? 'user.role_change' : 'user.update',
      entity: 'user',
      entityId: id,
      details: {
        name: target.name,
        fromRole: target.role,
        toRole: nextRole,
        active: nextActive,
      },
    });

    const [updated] = await pool.query(`${SELECT} WHERE u.id = ?`, [id]);
    res.json({ user: { ...updated[0], is_active: Number(updated[0].is_active) === 1 }, message: 'User updated.' });
  })
);

router.post(
  '/:id/reset-password',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8)
      throw new ApiError(400, 'Password must be at least 8 characters.');
    const [rows] = await pool.query('SELECT id, name FROM hrm_users WHERE id = ?', [id]);
    if (!rows[0]) throw new ApiError(404, 'User not found.');
    const hash = await bcrypt.hash(String(newPassword), 10);
    await pool.query('UPDATE hrm_users SET password_hash = ? WHERE id = ?', [hash, id]);
    await audit(req, { action: 'user.password_reset', entity: 'user', entityId: id, details: { name: rows[0].name } });
    res.json({ message: 'Password reset successfully.' });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) throw new ApiError(400, 'You cannot delete your own account.');
    const [rows] = await pool.query('SELECT id, name, role FROM hrm_users WHERE id = ?', [id]);
    const target = rows[0];
    if (!target) throw new ApiError(404, 'User not found.');
    if (target.role === 'super_admin') {
      const [[countRow]] = await pool.query(
        "SELECT COUNT(*) AS count FROM hrm_users WHERE role = 'super_admin' AND is_active = 1"
      );
      if (Number(countRow.count) <= 1) throw new ApiError(400, 'At least one active Super Admin must remain.');
    }
    await pool.query('DELETE FROM hrm_users WHERE id = ?', [id]);
    await audit(req, { action: 'user.delete', entity: 'user', entityId: id, details: { name: target.name, role: target.role } });
    res.json({ message: 'User account deleted.' });
  })
);

export default router;

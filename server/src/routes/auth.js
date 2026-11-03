import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { asyncHandler, ApiError } from '../utils.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { PERMISSION_KEYS, ROLE_LABELS } from '../permissions.js';

const router = Router();

const publicUser = (u, permissions = []) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  roleLabel: ROLE_LABELS[u.role] || u.role,
  employeeId: u.employee_id,
  avatarColor: u.avatar_color,
  lastLogin: u.last_login,
  isActive: Number(u.is_active ?? 1) === 1,
  permissions,
});

async function permissionsForRole(role) {
  if (role === 'super_admin') return [...PERMISSION_KEYS];
  const [rows] = await pool.query(
    'SELECT permission FROM hrm_role_permissions WHERE role = ?',
    [role]
  );
  return rows.map((r) => r.permission);
}

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) throw new ApiError(400, 'Email and password are required.');

    const [rows] = await pool.query('SELECT * FROM hrm_users WHERE email = ? LIMIT 1', [
      String(email).trim().toLowerCase(),
    ]);
    const user = rows[0];
    if (!user) throw new ApiError(401, 'Invalid email or password.');
    if (!Number(user.is_active ?? 1))
      throw new ApiError(403, 'Your account has been deactivated. Contact your administrator.');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new ApiError(401, 'Invalid email or password.');

    await pool.query('UPDATE hrm_users SET last_login = NOW() WHERE id = ?', [user.id]);

    const permissions = await permissionsForRole(user.role);
    const token = signToken(user);
    res.json({ token, user: publicUser(user, permissions) });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT u.*, e.employee_code, e.designation, e.join_date, e.department_id,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              d.name AS department_name, d.color AS department_color
       FROM hrm_users u
       LEFT JOIN hrm_employees e ON e.id = u.employee_id
       LEFT JOIN hrm_departments d ON d.id = e.department_id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (!rows[0]) throw new ApiError(404, 'Account not found.');
    const u = rows[0];
    res.json({
      user: publicUser(u, req.permissions),
      employee: u.employee_id
        ? {
            id: u.employee_id,
            code: u.employee_code,
            designation: u.designation,
            department: u.department_name,
            departmentColor: u.department_color,
            joinDate: u.join_date,
          }
        : null,
    });
  })
);

router.patch(
  '/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    const { name, email, avatarColor } = req.body || {};
    if (name !== undefined && !String(name).trim()) throw new ApiError(400, 'Name cannot be empty.');
    if (email !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      throw new ApiError(400, 'Please enter a valid email address.');

    try {
      await pool.query('UPDATE hrm_users SET name = COALESCE(?, name), email = COALESCE(?, email), avatar_color = COALESCE(?, avatar_color) WHERE id = ?', [
        name?.trim() || null,
        email?.trim().toLowerCase() || null,
        avatarColor || null,
        req.user.id,
      ]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'That email is already in use.');
      throw e;
    }

    const [rows] = await pool.query('SELECT * FROM hrm_users WHERE id = ?', [req.user.id]);
    res.json({ user: publicUser(rows[0], req.permissions), message: 'Profile updated.' });
  })
);

router.patch(
  '/password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) throw new ApiError(400, 'Both passwords are required.');
    if (String(newPassword).length < 8) throw new ApiError(400, 'New password must be at least 8 characters.');

    const [rows] = await pool.query('SELECT password_hash FROM hrm_users WHERE id = ?', [req.user.id]);
    const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!ok) throw new ApiError(400, 'Your current password is incorrect.');

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE hrm_users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    res.json({ message: 'Password changed successfully.' });
  })
);

export default router;

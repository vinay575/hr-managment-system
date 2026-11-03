import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { ApiError } from '../utils.js';
import { PERMISSION_KEYS } from '../permissions.js';

/**
 * Verify the JWT, then reload the account so role/permission changes and
 * deactivations take effect immediately — without invalidating old tokens.
 */
export async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'Please sign in to continue.'));

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return next(new ApiError(401, 'Your session has expired. Please sign in again.'));
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, role, employee_id, avatar_color, is_active, last_login
       FROM hrm_users WHERE id = ? LIMIT 1`,
      [decoded.id]
    );
    const account = rows[0];
    if (!account) return next(new ApiError(401, 'Your account no longer exists.'));
    if (!Number(account.is_active ?? 1))
      return next(new ApiError(403, 'Your account has been deactivated. Contact your administrator.'));

    let permissions;
    if (account.role === 'super_admin') {
      permissions = [...PERMISSION_KEYS];
    } else {
      const [permRows] = await pool.query(
        'SELECT permission FROM hrm_role_permissions WHERE role = ?',
        [account.role]
      );
      permissions = permRows.map((p) => p.permission);
    }

    req.user = {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      employeeId: account.employee_id,
      avatarColor: account.avatar_color,
      lastLogin: account.last_login,
      permissions,
    };
    req.permissions = permissions;
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermission(...needed) {
  return (req, res, next) => {
    if (req.user?.role === 'super_admin') return next();
    const ok = needed.every((p) => req.permissions?.includes(p));
    if (!ok) return next(new ApiError(403, 'You do not have permission to access this resource.'));
    next();
  };
}

export function requireAnyPermission(...needed) {
  return (req, res, next) => {
    if (req.user?.role === 'super_admin') return next();
    const ok = needed.some((p) => req.permissions?.includes(p));
    if (!ok) return next(new ApiError(403, 'You do not have permission to access this resource.'));
    next();
  };
}

/**
 * Kept for backwards compatibility with older routes. New code should use
 * requirePermission() / requireAnyPermission().
 */
export function requireManager(req, res, next) {
  if (!req.user || req.user.role === 'employee')
    return next(new ApiError(403, 'You do not have permission to do that.'));
  next();
}

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      employeeId: user.employee_id,
      avatarColor: user.avatar_color,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

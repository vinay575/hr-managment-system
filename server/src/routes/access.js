import { Router } from 'express';
import pool from '../db.js';
import { asyncHandler, ApiError } from '../utils.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { audit } from '../audit.js';
import {
  DEFAULT_ROLE_PERMISSIONS,
  isKnownPermission,
  isKnownRole,
  PERMISSIONS,
  PERMISSION_KEYS,
  ROLES,
} from '../permissions.js';

const router = Router();
router.use(authenticate);
router.use(requirePermission('roles.manage'));

async function permissionMatrix() {
  const [rows] = await pool.query(
    'SELECT role, permission FROM hrm_role_permissions ORDER BY role, permission'
  );
  const matrix = Object.fromEntries(ROLES.map((r) => [r.key, []]));
  for (const row of rows) {
    if (!matrix[row.role]) matrix[row.role] = [];
    matrix[row.role].push(row.permission);
  }
  // Super admin always holds every permission.
  matrix.super_admin = [...PERMISSION_KEYS];
  return matrix;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({
      roles: ROLES,
      permissions: PERMISSIONS,
      matrix: await permissionMatrix(),
      defaults: DEFAULT_ROLE_PERMISSIONS,
    });
  })
);

router.put(
  '/:role',
  asyncHandler(async (req, res) => {
    const { role } = req.params;
    if (!isKnownRole(role)) throw new ApiError(404, 'Unknown role.');
    if (role === 'super_admin')
      throw new ApiError(400, 'Super Admin always has full access and cannot be changed.');

    const raw = req.body?.permissions;
    if (!Array.isArray(raw)) throw new ApiError(400, 'Permissions must be an array.');

    const permissions = [...new Set(raw.filter(isKnownPermission))];
    const unknown = raw.filter((p) => !isKnownPermission(p));
    if (unknown.length)
      throw new ApiError(400, `Unknown permission: ${unknown.join(', ')}`);

    const conn = await pool.getConnection();
    let before = [];
    try {
      await conn.beginTransaction();
      const [existing] = await conn.query(
        'SELECT permission FROM hrm_role_permissions WHERE role = ?',
        [role]
      );
      before = existing.map((r) => r.permission);

      await conn.query('DELETE FROM hrm_role_permissions WHERE role = ?', [role]);
      for (const permission of permissions) {
        await conn.query(
          'INSERT INTO hrm_role_permissions (role, permission) VALUES (?, ?)',
          [role, permission]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await audit(req, {
      action: 'permissions.update',
      entity: 'role',
      entityId: role,
      details: { added: permissions.filter((p) => !before.includes(p)), removed: before.filter((p) => !permissions.includes(p)) },
    });

    res.json({ message: 'Permissions updated.', matrix: await permissionMatrix() });
  })
);

export default router;

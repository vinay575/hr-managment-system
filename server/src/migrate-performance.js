import pool from './db.js';
import { PERFORMANCE_SCHEMA } from './performance-schema.js';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS, ROLE_KEYS } from './permissions.js';

/**
 * Safe, idempotent Phase 5 migration. Creates only new performance tables and
 * seeds the performance permissions without touching existing HR data.
 *
 *   npm run migrate:performance
 */
async function migrate() {
  console.log('--- Aurora HR: Migrating Phase 5 Performance Schema ---');

  for (const statement of PERFORMANCE_SCHEMA) {
    try {
      await pool.query(statement);
      const match = statement.match(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/i);
      if (match) console.log(`✓ Table ensured: ${match[1]}`);
    } catch (err) {
      console.error('Error running SQL statement:', err.message);
      throw err;
    }
  }

  // Roll out new permissions. Only seed a role when it holds no performance
  // permission yet, so later custom edits in Access Control are preserved.
  const performancePermissionKeys = PERMISSION_KEYS.filter((p) => p.startsWith('performance.'));
  for (const role of ROLE_KEYS) {
    const defaults =
      role === 'super_admin'
        ? performancePermissionKeys
        : (DEFAULT_ROLE_PERMISSIONS[role] || []).filter((p) => p.startsWith('performance.'));
    const [[existing]] = await pool.query(
      "SELECT COUNT(*) AS count FROM hrm_role_permissions WHERE role = ? AND permission LIKE 'performance.%'",
      [role]
    );
    if (Number(existing.count) === 0) {
      for (const permission of defaults) {
        await pool.query(
          'INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES (?,?)',
          [role, permission]
        );
      }
      console.log(`✓ Seeded ${defaults.length} performance permission(s) for ${role}`);
    } else {
      console.log(`• ${role} already has performance permissions — left unchanged`);
    }
  }

  // Super admin always holds every permission in the catalogue.
  for (const permission of PERMISSION_KEYS) {
    await pool.query(
      'INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES (?,?)',
      ['super_admin', permission]
    );
  }

  console.log('--- Phase 5 Performance Migration Complete ---');
  await pool.end();
}

migrate().catch(async (err) => {
  console.error('Migration failed:', err);
  try {
    await pool.end();
  } catch {
    /* noop */
  }
  process.exit(1);
});

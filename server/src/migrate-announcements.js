import mysql from 'mysql2/promise';
import defaultPool from './db.js';
import { ANNOUNCEMENT_SCHEMA } from './announcement-schema.js';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS, ROLE_KEYS } from './permissions.js';

/**
 * Safe, idempotent Phase 7 migration.
 *
 *   npm run migrate:announcements
 *
 * If the application database account cannot create tables, provide a
 * temporary administrator account without changing the app credentials:
 *
 *   DB_ADMIN_USER=... DB_ADMIN_PASSWORD=... npm run migrate:announcements
 *
 * Creates only new announcement tables and seeds announcement permissions.
 * Existing employees, departments, users, notifications and all other HR data
 * are left untouched.
 */
const pool = process.env.DB_ADMIN_USER
  ? mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_ADMIN_USER,
      password: process.env.DB_ADMIN_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 2,
      ssl: process.env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2' } : undefined,
      dateStrings: true,
    })
  : defaultPool;

async function migrate() {
  console.log('--- Aurora HR: Migrating Phase 7 Announcement Schema ---');
  if (process.env.DB_ADMIN_USER) console.log(`• Using administrative account: ${process.env.DB_ADMIN_USER}`);

  for (const statement of ANNOUNCEMENT_SCHEMA) {
    await pool.query(statement);
    const match = statement.match(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/i);
    if (match) console.log(`✓ Table ensured: ${match[1]}`);
  }

  const announcementPermissions = PERMISSION_KEYS.filter((p) => p.startsWith('announcements.'));
  for (const role of ROLE_KEYS) {
    const defaults =
      role === 'super_admin'
        ? announcementPermissions
        : (DEFAULT_ROLE_PERMISSIONS[role] || []).filter((p) => p.startsWith('announcements.'));
    const [[existing]] = await pool.query(
      "SELECT COUNT(*) AS count FROM hrm_role_permissions WHERE role = ? AND permission LIKE 'announcements.%'",
      [role]
    );
    if (Number(existing.count) === 0) {
      for (const permission of defaults) {
        await pool.query(
          'INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES (?,?)',
          [role, permission]
        );
      }
      console.log(`✓ Seeded ${defaults.length} announcement permission(s) for ${role}`);
    } else {
      console.log(`• ${role} already has announcement permissions — left unchanged`);
    }
  }

  for (const permission of PERMISSION_KEYS) {
    await pool.query(
      'INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES (?,?)',
      ['super_admin', permission]
    );
  }

  console.log('--- Phase 7 Announcement Migration Complete ---');
  await pool.end();
}

migrate().catch(async (err) => {
  console.error('Migration failed:', err.message);
  if (err.code === 'ER_TABLEACCESS_DENIED_ERROR' || err.code === 'ER_DBACCESS_DENIED_ERROR') {
    console.error('\nThe current database account cannot create tables.');
    console.error('Either run server/sql/phase7-announcements.sql in your database console,');
    console.error('or provide a temporary administrator account:');
    console.error('  DB_ADMIN_USER=... DB_ADMIN_PASSWORD=... npm run migrate:announcements\n');
  }
  try {
    await pool.end();
  } catch {
    /* noop */
  }
  process.exit(1);
});

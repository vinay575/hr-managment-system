import mysql from 'mysql2/promise';
import defaultPool from './db.js';
import { DOCUMENT_SCHEMA, DEFAULT_DOCUMENT_CATEGORIES, DEFAULT_DOCUMENT_SETTINGS } from './document-schema.js';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS, ROLE_KEYS } from './permissions.js';

/**
 * Safe, idempotent Phase 6 migration.
 *
 *   npm run migrate:documents
 *
 * If the application database account cannot create tables, provide a
 * temporary administrator account without changing the app credentials:
 *
 *   DB_ADMIN_USER=... DB_ADMIN_PASSWORD=... npm run migrate:documents
 *
 * Creates only new document tables. Existing employees, onboarding records,
 * exit documents and all other HR data are left untouched.
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
  console.log('--- Kodewar HR: Migrating Phase 6 Document Schema ---');
  if (process.env.DB_ADMIN_USER) console.log(`• Using administrative account: ${process.env.DB_ADMIN_USER}`);

  for (const statement of DOCUMENT_SCHEMA) {
    await pool.query(statement);
    const match = statement.match(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/i);
    if (match) console.log(`✓ Table ensured: ${match[1]}`);
  }

  let seededCategories = 0;
  let order = 0;
  for (const category of DEFAULT_DOCUMENT_CATEGORIES) {
    const [result] = await pool.query(
      `INSERT IGNORE INTO document_categories
         (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order)
       VALUES (?,?,?,?,?,?,?,1,?)`,
      [
        category.name,
        category.slug,
        category.group,
        category.required,
        category.expiry,
        category.uploads,
        category.verification,
        order++,
      ]
    );
    seededCategories += result.affectedRows ? 1 : 0;
  }
  console.log(`✓ Document categories ready (${seededCategories} new)`);

  for (const [key, value] of Object.entries(DEFAULT_DOCUMENT_SETTINGS)) {
    await pool.query(
      'INSERT IGNORE INTO document_settings (setting_key, setting_value) VALUES (?,?)',
      [key, value]
    );
  }
  console.log('✓ Document settings defaults ready');

  const documentPermissionKeys = PERMISSION_KEYS.filter((p) => p.startsWith('documents.'));
  for (const role of ROLE_KEYS) {
    const defaults =
      role === 'super_admin'
        ? documentPermissionKeys
        : (DEFAULT_ROLE_PERMISSIONS[role] || []).filter((p) => p.startsWith('documents.'));
    const [[existing]] = await pool.query(
      "SELECT COUNT(*) AS count FROM hrm_role_permissions WHERE role = ? AND permission LIKE 'documents.%'",
      [role]
    );
    if (Number(existing.count) === 0) {
      for (const permission of defaults) {
        await pool.query(
          'INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES (?,?)',
          [role, permission]
        );
      }
      console.log(`✓ Seeded ${defaults.length} document permission(s) for ${role}`);
    } else {
      console.log(`• ${role} already has document permissions — left unchanged`);
    }
  }

  for (const permission of PERMISSION_KEYS) {
    await pool.query(
      'INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES (?,?)',
      ['super_admin', permission]
    );
  }

  console.log('--- Phase 6 Document Migration Complete ---');
  await pool.end();
}

migrate().catch(async (err) => {
  console.error('Migration failed:', err.message);
  if (err.code === 'ER_TABLEACCESS_DENIED_ERROR' || err.code === 'ER_DBACCESS_DENIED_ERROR') {
    console.error('\nThe current database account cannot create tables.');
    console.error('Either run server/sql/phase6-documents.sql in your database console,');
    console.error('or provide a temporary administrator account:');
    console.error('  DB_ADMIN_USER=... DB_ADMIN_PASSWORD=... npm run migrate:documents\n');
  }
  try {
    await pool.end();
  } catch {
    /* noop */
  }
  process.exit(1);
});

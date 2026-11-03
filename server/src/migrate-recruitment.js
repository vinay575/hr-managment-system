import pool from './db.js';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_KEYS,
  ROLES,
} from './permissions.js';
import { RECRUITMENT_SCHEMA, RECRUITMENT_TABLES } from './recruitment-schema.js';

/**
 * Safe, idempotent recruitment migration.
 *
 *   npm run migrate:recruitment
 *
 * Adds recruitment tables, indexes, foreign keys and the new permission keys.
 * Existing rows in hrm_employees / hrm_departments / hrm_users are untouched.
 */
async function migrate() {
  const conn = await pool.getConnection();
  try {
    console.log('→ Migrating Aurora HR recruitment module…');

    for (const statement of RECRUITMENT_SCHEMA) {
      await conn.query(statement);
    }
    console.log(`   • Ensured ${RECRUITMENT_TABLES.length} recruitment tables`);

    // Additive permission seeding. Existing custom matrices are preserved:
    // only the new recruitment keys are inserted, and only when absent.
    const recruitmentKeys = PERMISSION_KEYS.filter((key) => key.startsWith('recruitment.'));
    let inserted = 0;

    for (const role of ROLES.map((r) => r.key)) {
      const granted =
        role === 'super_admin'
          ? recruitmentKeys
          : (DEFAULT_ROLE_PERMISSIONS[role] || []).filter((key) => key.startsWith('recruitment.'));

      for (const permission of granted) {
        const [result] = await conn.query(
          'INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES (?, ?)',
          [role, permission]
        );
        inserted += result.affectedRows || 0;
      }
    }
    console.log(`   • Added ${inserted} recruitment permission grant(s)`);

    const [rows] = await conn.query(
      `SELECT role, COUNT(*) AS count FROM hrm_role_permissions
       WHERE permission LIKE 'recruitment.%' GROUP BY role ORDER BY role`
    );
    console.log('   Recruitment permissions by role:');
    for (const row of rows) console.log(`   • ${row.role.padEnd(15)} ${row.count}`);

    const [tableCounts] = await conn.query(
      `SELECT
        (SELECT COUNT(*) FROM recruitment_jobs) AS jobs,
        (SELECT COUNT(*) FROM recruitment_candidates) AS candidates,
        (SELECT COUNT(*) FROM recruitment_applications) AS applications`
    );
    const c = tableCounts[0];
    console.log(`\n✅ Recruitment migration complete. Current data: ${c.jobs} jobs, ${c.candidates} candidates, ${c.applications} applications.`);
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Recruitment migration failed:', err);
  process.exit(1);
});

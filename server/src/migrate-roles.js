import bcrypt from 'bcryptjs';
import pool from './db.js';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_KEYS,
  ROLES,
} from './permissions.js';

/**
 * Safe, idempotent upgrade from the original 3-role schema to the
 * 5-role + permission system. Safe to run repeatedly.
 *
 *   npm run migrate:roles
 */
async function migrate() {
  const conn = await pool.getConnection();
  try {
    console.log('→ Migrating Aurora HR roles & permissions…');

    // ---------------------------------------------------------------
    // 1. users.role: enum -> varchar (supports all five roles safely)
    // ---------------------------------------------------------------
    await conn.query(
      `ALTER TABLE hrm_users MODIFY COLUMN role VARCHAR(32) NOT NULL DEFAULT 'employee'`
    );

    // ---------------------------------------------------------------
    // 2. Account status flag
    // ---------------------------------------------------------------
    const [[activeCol]] = await conn.query(
      `SELECT COUNT(*) AS count FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'hrm_users' AND column_name = 'is_active'`
    );
    if (!Number(activeCol.count)) {
      await conn.query(
        `ALTER TABLE hrm_users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`
      );
      console.log('   • Added hrm_users.is_active');
    }

    // ---------------------------------------------------------------
    // 3. Role permission matrix
    // ---------------------------------------------------------------
    await conn.query(`
      CREATE TABLE IF NOT EXISTS hrm_role_permissions (
        role VARCHAR(32) NOT NULL,
        permission VARCHAR(64) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (role, permission)
      )
    `);

    // ---------------------------------------------------------------
    // 4. Audit trail
    // ---------------------------------------------------------------
    await conn.query(`
      CREATE TABLE IF NOT EXISTS hrm_audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        actor_id INT NULL,
        actor_name VARCHAR(100) NULL,
        actor_role VARCHAR(32) NULL,
        action VARCHAR(80) NOT NULL,
        entity VARCHAR(40) NULL,
        entity_id VARCHAR(40) NULL,
        details JSON NULL,
        ip VARCHAR(64) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_created (created_at),
        INDEX idx_audit_actor (actor_id),
        INDEX idx_audit_action (action)
      )
    `);

    // ---------------------------------------------------------------
    // 5. Migrate existing accounts. Existing admin -> super_admin.
    // ---------------------------------------------------------------
    const [converted] = await conn.query(
      `UPDATE hrm_users SET role = 'super_admin' WHERE role = 'admin'`
    );
    if (converted.affectedRows) {
      console.log(`   • Migrated ${converted.affectedRows} admin account(s) to super_admin`);
    }

    // ---------------------------------------------------------------
    // 6. Seed default role permissions (never overwrite custom edits).
    // ---------------------------------------------------------------
    for (const role of ROLES.map((r) => r.key)) {
      if (role === 'super_admin') {
        for (const permission of PERMISSION_KEYS) {
          await conn.query(
            'INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES (?, ?)',
            [role, permission]
          );
        }
        continue;
      }

      for (const permission of (DEFAULT_ROLE_PERMISSIONS[role] || [])) {
        await conn.query(
          'INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES (?, ?)',
          [role, permission]
        );
      }
      console.log(`   • Ensured default permissions for ${role}`);
    }

    // ---------------------------------------------------------------
    // 7. Add CEO and Administration demo accounts if missing.
    //    No existing records are deleted or overwritten.
    // ---------------------------------------------------------------
    const [[olivia]] = await conn.query(
      `SELECT id FROM hrm_employees WHERE first_name = 'Olivia' AND last_name = 'Bennett' LIMIT 1`
    );
    const [[benjamin]] = await conn.query(
      `SELECT id FROM hrm_employees WHERE first_name = 'Benjamin' AND last_name = 'Clarke' LIMIT 1`
    );

    const hash = (pw) => bcrypt.hashSync(pw, 10);
    const extras = [
      ['Olivia Bennett', 'ceo@aurorahr.com', 'ceo123456', 'ceo', olivia?.id ?? null, 'indigo'],
      ['Benjamin Clarke', 'office@aurorahr.com', 'office123456', 'administration', benjamin?.id ?? null, 'emerald'],
    ];
    for (const account of extras) {
      const [[existing]] = await conn.query(
        'SELECT id FROM hrm_users WHERE email = ? LIMIT 1',
        [account[1]]
      );
      if (!existing) {
        await conn.query(
          `INSERT INTO hrm_users (name, email, password_hash, role, employee_id, avatar_color, is_active)
           VALUES (?,?,?,?,?,?,1)`,
          [account[0], account[1], hash(account[2]), account[3], account[4], account[5]]
        );
        console.log(`   • Created ${account[3]} account (${account[1]})`);
      }
    }

    // ---------------------------------------------------------------
    // 8. Report current distribution
    // ---------------------------------------------------------------
    const [rows] = await conn.query(
      'SELECT role, COUNT(*) AS count FROM hrm_users GROUP BY role ORDER BY role'
    );
    console.log('\n✅ Role migration complete.');
    console.log('   Accounts by role:');
    for (const row of rows) console.log(`   • ${row.role.padEnd(15)} ${row.count}`);
    console.log('\n   Demo logins:');
    console.log('   • Super Admin    → admin@aurorahr.com / admin123');
    console.log('   • CEO            → ceo@aurorahr.com / ceo123456');
    console.log('   • Administration → office@aurorahr.com / office123456');
    console.log('   • HR             → hr@aurorahr.com / hr123456');
    console.log('   • Employee       → sarah@aurorahr.com / employee123');
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

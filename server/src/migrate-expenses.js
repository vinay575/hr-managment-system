import pool from './db.js';
import { EXPENSE_SCHEMA, DEFAULT_EXPENSE_CATEGORIES, DEFAULT_EXPENSE_SETTINGS } from './expense-schema.js';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS, ROLE_KEYS } from './permissions.js';

/**
 * Safe, idempotent Phase 4 migration. Creates only new expense tables and
 * seeds defaults without touching existing HR data.
 *
 *   npm run migrate:expenses
 */
async function migrate() {
  console.log('--- Aurora HR: Migrating Phase 4 Expense Schema ---');

  for (const statement of EXPENSE_SCHEMA) {
    try {
      await pool.query(statement);
      const match = statement.match(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/i);
      if (match) console.log(`✓ Table ensured: ${match[1]}`);
    } catch (err) {
      console.error('Error running SQL statement:', err.message);
      throw err;
    }
  }

  // Seed the ten default categories once. Existing categories are never overwritten.
  let seeded = 0;
  for (const cat of DEFAULT_EXPENSE_CATEGORIES) {
    const [result] = await pool.query(
      `INSERT IGNORE INTO expense_categories (name, description, receipt_required, max_claim_amount, is_active)
       VALUES (?,?,?,?,1)`,
      [cat.name, cat.description, cat.receipt_required, cat.max_claim_amount]
    );
    seeded += result.affectedRows ? 1 : 0;
  }
  console.log(`✓ Expense categories ready (${seeded} new)`);

  for (const [key, value] of Object.entries(DEFAULT_EXPENSE_SETTINGS)) {
    await pool.query(
      'INSERT IGNORE INTO expense_settings (setting_key, setting_value) VALUES (?,?)',
      [key, value]
    );
  }
  console.log('✓ Expense policy defaults ready');

  // Roll out new permissions. Only seed a role when it holds no expense
  // permission yet, so later custom edits in Access Control are preserved.
  const expensePermissionKeys = PERMISSION_KEYS.filter((p) => p.startsWith('expenses.'));
  for (const role of ROLE_KEYS) {
    const defaults = role === 'super_admin' ? expensePermissionKeys : (DEFAULT_ROLE_PERMISSIONS[role] || []).filter((p) => p.startsWith('expenses.'));
    const [[existing]] = await pool.query(
      "SELECT COUNT(*) AS count FROM hrm_role_permissions WHERE role = ? AND permission LIKE 'expenses.%'",
      [role]
    );
    if (Number(existing.count) === 0) {
      for (const permission of defaults) {
        await pool.query(
          'INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES (?,?)',
          [role, permission]
        );
      }
      console.log(`✓ Seeded ${defaults.length} expense permission(s) for ${role}`);
    } else {
      console.log(`• ${role} already has expense permissions — left unchanged`);
    }
  }

  // Super admin always holds every permission in the catalogue.
  for (const permission of PERMISSION_KEYS) {
    await pool.query(
      'INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES (?,?)',
      ['super_admin', permission]
    );
  }

  console.log('--- Phase 4 Expense Migration Complete ---');
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

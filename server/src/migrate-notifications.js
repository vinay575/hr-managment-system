import pool from './db.js';
import { NOTIFICATION_SCHEMA } from './notification-schema.js';

async function migrate() {
  console.log('--- Aurora HR: Migrating persistent notifications ---');
  for (const statement of NOTIFICATION_SCHEMA) {
    await pool.query(statement);
    console.log('✓ Notification table ensured');
  }
  console.log('--- Notification migration complete ---');
}

migrate()
  .catch((err) => {
    console.error('Notification migration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

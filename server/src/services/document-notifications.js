import pool from '../db.js';
import { isoDate } from '../utils.js';
import {
  computeMissingDocuments,
  expiryInfo,
  getCategoryMap,
  getDocumentSettings,
  settingFlag,
} from './documents.js';

/**
 * Notification + reminder integration. Reuses the existing hrm_notifications
 * table and dedupe key so the bell, notifications page and reminder scheduler
 * stay on one infrastructure.
 */

export async function notifyUser(userId, { category = 'document', permission = 'documents.self', title, message, path = '/documents', dedupeKey }) {
  if (!userId) return false;
  const [result] = await pool.query(
    `INSERT INTO hrm_notifications
       (recipient_user_id, category, visibility_permission, title, message, related_path, dedupe_key)
     VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [userId, category, permission, String(title).slice(0, 180), String(message).slice(0, 1000), path, String(dedupeKey).slice(0, 191)]
  );
  return Boolean(result.affectedRows);
}

export async function notifyEmployee(employeeId, payload) {
  if (!employeeId) return 0;
  const [users] = await pool.query(
    'SELECT id FROM hrm_users WHERE employee_id = ? AND is_active = 1',
    [employeeId]
  );
  let sent = 0;
  for (const user of users) {
    if (await notifyUser(user.id, payload)) sent += 1;
  }
  return sent;
}

export async function notifyDocumentVerifiers(payload) {
  const [users] = await pool.query(
    `SELECT DISTINCT u.id
     FROM hrm_users u
     JOIN hrm_role_permissions rp ON rp.role = u.role AND rp.permission = 'documents.verify'
     WHERE u.is_active = 1`
  );
  let sent = 0;
  for (const user of users) {
    if (await notifyUser(user.id, payload)) sent += 1;
  }
  return sent;
}

async function recordReminder({ documentId = null, employeeId, categoryId = null, type, daysBefore = null, recipientUserId = null, dedupeKey }) {
  const [result] = await pool.query(
    `INSERT IGNORE INTO document_reminder_history
       (document_id, employee_id, category_id, reminder_type, days_before, recipient_user_id, dedupe_key)
     VALUES (?,?,?,?,?,?,?)`,
    [documentId, employeeId, categoryId, type, daysBefore, recipientUserId, dedupeKey]
  );
  return Boolean(result.affectedRows);
}

/**
 * Run expiry and missing-document reminders.
 * Idempotent per document / interval / calendar day.
 */
export async function runDocumentReminders({ actorUserId = null } = {}) {
  const settings = await getDocumentSettings();
  if (!settingFlag(settings.documents_enabled)) return { expiry: 0, missing: 0 };

  const intervals = String(settings.expiry_reminder_days || '30,15,7,0')
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => b - a);
  const warningDays = Number(settings.expiry_warning_days) || 30;
  const today = isoDate();

  let expirySent = 0;
  let missingSent = 0;

  if (settingFlag(settings.notify_employee)) {
    const [documents] = await pool.query(
      `SELECT d.id, d.employee_id, d.name, d.expiry_date, d.status,
              e.first_name, e.last_name
       FROM employee_documents d
       JOIN hrm_employees e ON e.id = d.employee_id
       WHERE d.expiry_date IS NOT NULL AND d.status = 'verified'
       ORDER BY d.expiry_date ASC
       LIMIT 2000`
    );

    for (const doc of documents) {
      const info = expiryInfo(doc.expiry_date, warningDays);
      if (!['expired', 'expiring'].includes(info.key)) continue;

      let interval = null;
      if (info.key === 'expired') interval = 0;
      else interval = intervals.find((n) => n >= info.days) ?? intervals[intervals.length - 1];
      if (interval == null) continue;

      const dedupe = `doc-expiry-${doc.id}-${interval}-${today}`;
      const recorded = await recordReminder({
        documentId: doc.id,
        employeeId: doc.employee_id,
        type: 'expiry',
        daysBefore: interval,
        dedupeKey: dedupe,
      });
      if (!recorded) continue;

      const title = info.key === 'expired' ? 'Document has expired' : 'Document expiry reminder';
      const message =
        info.key === 'expired'
          ? `${doc.name} expired on ${doc.expiry_date}. Please upload a renewed copy.`
          : `${doc.name} expires on ${doc.expiry_date} (${info.days} day${info.days === 1 ? '' : 's'} left).`;
      await notifyEmployee(doc.employee_id, {
        title,
        message,
        path: '/documents/my',
        dedupeKey: dedupe,
      });
      expirySent += 1;

      if (settingFlag(settings.notify_hr)) {
        await notifyDocumentVerifiers({
          title: info.key === 'expired' ? 'Employee document expired' : 'Employee document expiring',
          message: `${doc.first_name} ${doc.last_name} · ${doc.name} · ${doc.expiry_date}`,
          path: '/documents/expiring',
          dedupeKey: `hr-${dedupe}`,
        });
      }
    }
  }

  if (settingFlag(settings.missing_document_reminders) && settingFlag(settings.notify_employee)) {
    const categories = await getCategoryMap();
    const missing = await computeMissingDocuments({ categories });
    const missingRows = missing.rows.filter((row) => row.status === 'missing' || row.status === 'rejected');
    // One reminder per employee per category per day to avoid notification spam.
    for (const row of missingRows.slice(0, 500)) {
      const dedupe = `doc-missing-${row.employee_id}-${row.category_id}-${today}`;
      const recorded = await recordReminder({
        employeeId: row.employee_id,
        categoryId: row.category_id,
        type: 'missing',
        dedupeKey: dedupe,
      });
      if (!recorded) continue;
      await notifyEmployee(row.employee_id, {
        title: 'Required document missing',
        message: `${row.category_name} is still required for your employee file. Please upload it from My Documents.`,
        path: '/documents/my',
        dedupeKey: dedupe,
      });
      missingSent += 1;
    }
  }

  return { expiry: expirySent, missing: missingSent, ranBy: actorUserId, ranAt: new Date().toISOString() };
}

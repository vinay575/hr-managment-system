import pool from '../db.js';
import { ApiError } from '../utils.js';

/**
 * Announcements service.
 *
 * Central place for validation rules, audience targeting, scheduled publishing
 * and notification fan-out. The notification fan-out reuses the existing
 * hrm_notifications table and its recipient + dedupe unique key, so repeated
 * publishing never produces duplicate notifications.
 */

export const ANNOUNCEMENT_CATEGORIES = [
  { key: 'general', label: 'General', tone: 'slate', description: 'Company-wide general updates.' },
  { key: 'hr', label: 'HR', tone: 'sky', description: 'People operations and HR notices.' },
  { key: 'holiday', label: 'Holiday', tone: 'emerald', description: 'Holidays, closures and office timings.' },
  { key: 'policy', label: 'Policy', tone: 'violet', description: 'Policy updates and compliance notices.' },
  { key: 'important', label: 'Important Notice', tone: 'rose', description: 'Urgent, high-visibility notices.' },
];

export const ANNOUNCEMENT_CATEGORY_KEYS = ANNOUNCEMENT_CATEGORIES.map((c) => c.key);

export const ANNOUNCEMENT_AUDIENCES = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'department', label: 'Specific Department' },
];

export const ANNOUNCEMENT_AUDIENCE_KEYS = ANNOUNCEMENT_AUDIENCES.map((a) => a.key);

export const ANNOUNCEMENT_STATUSES = [
  { key: 'draft', label: 'Draft', tone: 'slate' },
  { key: 'scheduled', label: 'Scheduled', tone: 'amber' },
  { key: 'published', label: 'Published', tone: 'emerald' },
  { key: 'archived', label: 'Archived', tone: 'slate' },
];

export const ANNOUNCEMENT_STATUS_KEYS = ANNOUNCEMENT_STATUSES.map((s) => s.key);

export const categoryLabel = (key) =>
  ANNOUNCEMENT_CATEGORIES.find((c) => c.key === key)?.label || 'General';

export const statusLabel = (key) =>
  ANNOUNCEMENT_STATUSES.find((s) => s.key === key)?.label || 'Draft';

export const audienceLabel = (row) => {
  if (!row || row.audience === 'everyone') return 'Everyone';
  return row.department_name ? `Department · ${row.department_name}` : 'Specific department';
};

export function cleanText(value, max = 500) {
  if (value == null) return '';
  return String(value).replace(/\u0000/g, '').trim().slice(0, max);
}

/** Store timestamps in the same local wall-clock time the UI schedules with. */
export function sqlDateTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function flag(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on' ? 1 : 0;
}

const DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/** Convert a browser datetime-local value into a MySQL DATETIME string. */
export function parsePublishAt(value, { label = 'publish date' } = {}) {
  if (value == null || value === '') return null;
  const match = String(value).trim().match(DATE_TIME_RE);
  if (!match) throw new ApiError(400, `Please enter a valid ${label}.`);
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(mo) - 1 ||
    date.getDate() !== Number(d) ||
    Number(h) > 23 ||
    Number(mi) > 59 ||
    Number(s) > 59
  ) {
    throw new ApiError(400, `Please enter a valid ${label}.`);
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${mo}-${d} ${pad(h)}:${pad(mi)}:${pad(s)}`;
}

export function normalizeCategory(value) {
  const key = String(value || 'general').trim().toLowerCase();
  return ANNOUNCEMENT_CATEGORY_KEYS.includes(key) ? key : null;
}

export function normalizeAudience(value) {
  const key = String(value || 'everyone').trim().toLowerCase();
  return ANNOUNCEMENT_AUDIENCE_KEYS.includes(key) ? key : null;
}

/** Target employees for an announcement (used by feed, reports and notifications). */
export function audienceClause(announcement, alias = 'e') {
  if (announcement?.audience === 'department') {
    return { sql: `${alias}.status <> 'inactive' AND ${alias}.department_id = ?`, params: [Number(announcement.department_id) || -1] };
  }
  return { sql: `${alias}.status <> 'inactive'`, params: [] };
}

export async function targetEmployees(announcement) {
  const audience = audienceClause(announcement);
  const [rows] = await pool.query(
    `SELECT e.id, e.first_name, e.last_name, e.employee_code, e.email, e.status,
            d.id AS department_id, d.name AS department_name,
            a.acknowledged_at, a.acknowledged_by, u.name AS acknowledged_by_name
     FROM hrm_employees e
     LEFT JOIN hrm_departments d ON d.id = e.department_id
     LEFT JOIN announcement_acknowledgments a ON a.announcement_id = ? AND a.employee_id = e.id
     LEFT JOIN hrm_users u ON u.id = a.acknowledged_by
     WHERE ${audience.sql}
     ORDER BY e.first_name ASC, e.last_name ASC`,
    [announcement.id, ...audience.params]
  );
  return rows.map((row) => ({
    ...row,
    employee_name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    status: row.acknowledged_at ? 'acknowledged' : 'pending',
  }));
}

export async function isAnnouncementTargeted(announcement, employeeId) {
  if (!announcement || !employeeId) return false;
  if (announcement.audience === 'everyone') return true;
  if (announcement.audience !== 'department') return false;
  const [[employee]] = await pool.query(
    "SELECT id, department_id, status FROM hrm_employees WHERE id = ? LIMIT 1",
    [employeeId]
  );
  return Boolean(employee) && employee.status !== 'inactive' && Number(employee.department_id) === Number(announcement.department_id);
}

/** Employees (with active user accounts) who should receive the notification. */
async function notificationRecipients(announcement) {
  const audience = audienceClause(announcement);
  const [rows] = await pool.query(
    `SELECT DISTINCT u.id AS user_id
     FROM hrm_employees e
     JOIN hrm_users u ON u.employee_id = e.id AND u.is_active = 1
     WHERE ${audience.sql}`,
    audience.params
  );
  return rows.map((row) => row.user_id);
}

/**
 * Send the announcement notification to every targeted user.
 * Deduplication uses one stable key per announcement and recipient, so editing,
 * re-saving or calling publish again never spams the employee.
 */
export async function notifyAnnouncement(announcement) {
  if (!announcement?.id || announcement.status !== 'published') return 0;
  const recipients = await notificationRecipients(announcement);
  if (!recipients.length) return 0;

  const title = `New announcement: ${announcement.title}`.slice(0, 180);
  const plain = String(announcement.content || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  const message = plain || 'Open My announcements to read the full notice.';
  const dedupe = `announcement-${announcement.id}`;
  let sent = 0;

  for (const userId of recipients) {
    const [result] = await pool.query(
      `INSERT INTO hrm_notifications
         (recipient_user_id, category, visibility_permission, title, message, related_path, dedupe_key)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [userId, 'announcement', 'announcements.self', title, message, '/announcements/my', dedupe]
    );
    if (result.affectedRows) sent += 1;
  }
  return sent;
}

/**
 * Publish every scheduled announcement whose time has arrived.
 * Safe to call on every announcement request: the status transition is
 * conditional, so only one concurrent request can publish a given row.
 */
export async function publishDueAnnouncements() {
  let published = 0;
  let notified = 0;
  const now = sqlDateTime();
  const [due] = await pool.query(
    `SELECT id FROM announcements
     WHERE status = 'scheduled' AND publish_at IS NOT NULL AND publish_at <= ?
     ORDER BY publish_at ASC LIMIT 200`,
    [now]
  );

  for (const row of due) {
    const [result] = await pool.query(
      `UPDATE announcements
       SET status = 'published', published_at = COALESCE(published_at, ?)
       WHERE id = ? AND status = 'scheduled'`,
      [now, row.id]
    );
    if (!result.affectedRows) continue;
    published += 1;
    const [[announcement]] = await pool.query('SELECT * FROM announcements WHERE id = ? LIMIT 1', [row.id]);
    if (announcement) notified += await notifyAnnouncement(announcement);
  }

  return { published, notified };
}

/** CEO announcements must remain company-wide, matching the role policy. */
export function assertManageScope(req, announcement = null) {
  if (req.user.role !== 'ceo') return;
  if (announcement && announcement.audience !== 'everyone') {
    throw new ApiError(403, 'CEOs can manage company-wide announcements only.');
  }
}

export function manageScopeAllowsAudience(req, audience) {
  return req.user.role !== 'ceo' || audience === 'everyone';
}

export function statusCounts(rows) {
  const counts = { total: rows.length, draft: 0, scheduled: 0, published: 0, archived: 0 };
  for (const row of rows) {
    if (Object.hasOwn(counts, row.status)) counts[row.status] += 1;
  }
  return counts;
}

export function ackStats(rows) {
  const total = rows.length;
  const acknowledged = rows.filter((row) => row.status === 'acknowledged').length;
  return {
    targeted: total,
    acknowledged,
    pending: total - acknowledged,
    completion: total ? Math.round((acknowledged / total) * 100) : 0,
  };
}

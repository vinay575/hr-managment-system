import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { Router } from 'express';
import pool from '../db.js';
import { audit } from '../audit.js';
import { asyncHandler, ApiError } from '../utils.js';
import { authenticate, requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { uploadDocumentMiddleware, validateDocumentContent, normalizedMime, safeOriginalName } from '../document-upload.js';
import { buildStorageKey, putDocument, getDocumentStream, deleteDocumentFile } from '../services/document-store.js';
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_ROLE_OPTIONS,
  ANNOUNCEMENT_STATUSES,
  ackStats,
  assertManageScope,
  audienceLabel,
  cleanText,
  flag,
  isAnnouncementTargeted,
  manageScopeAllowsAudience,
  maskToRoles,
  normalizeAudience,
  normalizeAudienceRoles,
  normalizeCategory,
  roleBit,
  rolesToMask,
  notifyAnnouncement,
  parsePublishAt,
  publishDueAnnouncements,
  sqlDateTime,
  statusCounts,
  targetEmployees,
} from '../services/announcements.js';

const router = Router();
router.use(authenticate);

const VIEW = requirePermission('announcements.view');
const MANAGE = requirePermission('announcements.manage');
const REPORTS = requirePermission('announcements.reports');
const SELF = requirePermission('announcements.self');
const VIEW_OR_SELF = requireAnyPermission('announcements.view', 'announcements.self');

const MAX_TITLE = 200;
const MAX_CONTENT = 20000;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
function paginateRows(rows, query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 15));
  const total = rows.length;
  const start = (page - 1) * limit;
  return {
    data: rows.slice(start, start + limit),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
}

const ANNOUNCEMENT_SELECT = `
  SELECT a.*, d.name AS department_name, u.name AS created_by_name,
    (SELECT COUNT(*) FROM announcement_acknowledgments ac WHERE ac.announcement_id = a.id) AS acknowledged_count,
    CASE
      WHEN a.audience = 'everyone' THEN
        (SELECT COUNT(*) FROM hrm_employees e WHERE e.status <> 'inactive')
      WHEN a.audience = 'roles' THEN
        (SELECT COUNT(DISTINCT e.id)
         FROM hrm_employees e
         JOIN hrm_users ur ON ur.employee_id = e.id AND ur.is_active = 1
         WHERE e.status <> 'inactive' AND (
           ((a.department_id & 1) <> 0 AND ur.role = 'employee') OR
           ((a.department_id & 2) <> 0 AND ur.role = 'hr') OR
           ((a.department_id & 4) <> 0 AND ur.role = 'administration') OR
           ((a.department_id & 8) <> 0 AND ur.role = 'ceo') OR
           ((a.department_id & 16) <> 0 AND ur.role = 'super_admin')
         ))
      WHEN a.audience = 'department' AND a.department_id IS NOT NULL THEN
        (SELECT COUNT(*) FROM hrm_employees e WHERE e.status <> 'inactive' AND e.department_id = a.department_id)
      ELSE 0
    END AS target_count
  FROM announcements a
  LEFT JOIN hrm_departments d ON d.id = a.department_id AND a.audience = 'department'
  LEFT JOIN hrm_users u ON u.id = a.created_by
`;

function decorate(row) {
  if (!row) return null;
  return {
    ...row,
    category_label: ANNOUNCEMENT_CATEGORIES.find((c) => c.key === row.category)?.label || 'General',
    status_label: ANNOUNCEMENT_STATUSES.find((s) => s.key === row.status)?.label || 'Draft',
    audience_label: audienceLabel(row),
    audience_roles: row.audience === 'roles' ? maskToRoles(row.department_id) : [],
    has_attachment: Boolean(row.attachment_key),
  };
}

async function loadAnnouncement(id) {
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) throw new ApiError(400, 'Invalid announcement ID.');
  const [[row]] = await pool.query(`${ANNOUNCEMENT_SELECT} WHERE a.id = ? LIMIT 1`, [numeric]);
  return row ? decorate(row) : null;
}

function booleanValue(value) {
  return ['1', 'true', 'on', 'yes'].includes(String(value ?? '').toLowerCase());
}

function validatePayload(req, { existing = null } = {}) {
  const body = req.body || {};
  const title = cleanText(body.title, MAX_TITLE);
  const content = cleanText(body.content, MAX_CONTENT);
  if (title.length < 3) throw new ApiError(400, 'Announcement title must be at least 3 characters.');
  if (content.length < 5) throw new ApiError(400, 'Announcement content is required.');

  const category = normalizeCategory(body.category);
  if (!category) throw new ApiError(400, 'Choose a valid announcement category.');

  const audience = normalizeAudience(body.audience);
  if (!audience) throw new ApiError(400, 'Choose a valid audience.');

  if (!manageScopeAllowsAudience(req, audience)) {
    throw new ApiError(403, 'You cannot publish an announcement for that audience.');
  }

  let departmentId = null;
  let roles = [];
  if (audience === 'department') {
    departmentId = Number(body.departmentId ?? body.department_id);
    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      throw new ApiError(400, 'Choose the department this announcement is for.');
    }
  } else if (audience === 'roles') {
    roles = normalizeAudienceRoles(body.roles ?? body.audienceRoles ?? body.audience_roles);
    if (!roles.length) {
      throw new ApiError(400, 'Choose at least one role for this announcement.');
    }
    // Packed role bitmask; only interpreted when audience = 'roles'.
    departmentId = rolesToMask(roles);
  }

  const requested = String(body.publishMode || body.publish_mode || body.status || '').toLowerCase();
  let publishMode = ['now', 'schedule', 'draft'].includes(requested) ? requested : null;
  if (!publishMode) publishMode = existing?.status === 'published' ? 'now' : existing?.status === 'scheduled' ? 'schedule' : 'draft';

  let publishAt = null;
  if (publishMode === 'schedule') {
    publishAt = parsePublishAt(body.publishAt ?? body.publish_at, { label: 'scheduled date and time' });
    if (!publishAt) throw new ApiError(400, 'Choose when this announcement should be published.');
    if (new Date(publishAt.replace(' ', 'T')).getTime() <= Date.now() - 60 * 1000) {
      throw new ApiError(400, 'Scheduled publication must be in the future.');
    }
  }

  return {
    title,
    content,
    category,
    audience,
    roles,
    departmentId,
    publishMode,
    publishAt,
    requiresAcknowledgment: flag(body.requiresAcknowledgment ?? body.requires_acknowledgment),
    removeAttachment: booleanValue(body.removeAttachment ?? body.remove_attachment),
  };
}

async function assertDepartment(departmentId, audience = 'department') {
  if (audience !== 'department' || !departmentId) return;
  const [[department]] = await pool.query('SELECT id FROM hrm_departments WHERE id = ? LIMIT 1', [departmentId]);
  if (!department) throw new ApiError(400, 'The selected department no longer exists.');
}

function statusForPayload(payload, existing = null) {
  if (payload.publishMode === 'now') {
    return {
      status: 'published',
      publishAt: existing?.publish_at || payload.publishAt || null,
      publishedAt: existing?.published_at || sqlDateTime(),
    };
  }
  if (payload.publishMode === 'schedule') {
    return { status: 'scheduled', publishAt: payload.publishAt, publishedAt: existing?.published_at || null };
  }
  return { status: 'draft', publishAt: null, publishedAt: existing?.published_at || null };
}

async function saveAttachment(file, { current = null, remove = false, userId = null } = {}) {
  if (file) {
    const ext = validateDocumentContent(file);
    const now = new Date();
    const key = `announcements/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}${ext}`;
    const stored = await putDocument(file.buffer, { key, mimeType: normalizedMime(file) });
    return {
      attachment_provider: stored.provider,
      attachment_key: stored.key,
      attachment_file_id: stored.fileId,
      attachment_name: safeOriginalName(file.originalname),
      attachment_size: file.size,
      attachment_mime: normalizedMime(file),
    };
  }
  if (remove) {
    if (current?.attachment_key) {
      await deleteDocumentFile({
        provider: current.attachment_provider,
        key: current.attachment_key,
        fileId: current.attachment_file_id,
      });
    }
    return {
      attachment_provider: null,
      attachment_key: null,
      attachment_file_id: null,
      attachment_name: null,
      attachment_size: null,
      attachment_mime: null,
    };
  }
  if (current) {
    return {
      attachment_provider: current.attachment_provider,
      attachment_key: current.attachment_key,
      attachment_file_id: current.attachment_file_id,
      attachment_name: current.attachment_name,
      attachment_size: current.attachment_size,
      attachment_mime: current.attachment_mime,
    };
  }
  return {
    attachment_provider: null,
    attachment_key: null,
    attachment_file_id: null,
    attachment_name: null,
    attachment_size: null,
    attachment_mime: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Meta                                                              */
/* ------------------------------------------------------------------ */
router.get(
  '/meta',
  VIEW_OR_SELF,
  asyncHandler(async (req, res) => {
    res.json({
      categories: ANNOUNCEMENT_CATEGORIES,
      audiences: ANNOUNCEMENT_AUDIENCES,
      roles: ANNOUNCEMENT_ROLE_OPTIONS,
      statuses: ANNOUNCEMENT_STATUSES,
    });
  })
);

/* ------------------------------------------------------------------ */
/*  Dashboard                                                         */
/* ------------------------------------------------------------------ */
router.get(
  '/dashboard',
  VIEW,
  asyncHandler(async (req, res) => {
    await publishDueAnnouncements();
    const [all] = await pool.query(
      `${ANNOUNCEMENT_SELECT} ORDER BY FIELD(a.status,'published','scheduled','draft','archived'), a.published_at DESC, a.created_at DESC`
    );
    const rows = all.map(decorate);
    const counts = statusCounts(rows);
    const ackRows = rows.filter((row) => row.status === 'published' && Number(row.requires_acknowledgment));
    const targeted = ackRows.reduce((sum, row) => sum + Number(row.target_count || 0), 0);
    const acknowledged = ackRows.reduce((sum, row) => sum + Number(row.acknowledged_count || 0), 0);

    res.json({
      summary: {
        total: counts.total,
        published: counts.published,
        scheduled: counts.scheduled,
        archived: counts.archived,
        draft: counts.draft,
        requiresAcknowledgment: ackRows.length,
      },
      acknowledgmentSummary: {
        announcements: ackRows.length,
        targeted,
        acknowledged,
        pending: Math.max(0, targeted - acknowledged),
        completion: targeted ? Math.round((acknowledged / targeted) * 100) : 0,
      },
      recent: rows.filter((row) => row.status === 'published').slice(0, 6),
      upcoming: rows
        .filter((row) => row.status === 'scheduled')
        .sort((a, b) => String(a.publish_at).localeCompare(String(b.publish_at)))
        .slice(0, 5),
    });
  })
);

/* ------------------------------------------------------------------ */
/*  Acknowledgment reports                                            */
/* ------------------------------------------------------------------ */
router.get(
  '/reports',
  REPORTS,
  asyncHandler(async (req, res) => {
    await publishDueAnnouncements();
    const [rows] = await pool.query(
      `${ANNOUNCEMENT_SELECT}
       WHERE a.requires_acknowledgment = 1 AND a.status = 'published'
       ORDER BY a.published_at DESC, a.id DESC`
    );
    res.json({ data: rows.map(decorate) });
  })
);

/* ------------------------------------------------------------------ */
/*  Employee feed                                                     */
/* ------------------------------------------------------------------ */
router.get(
  '/my',
  SELF,
  asyncHandler(async (req, res) => {
    await publishDueAnnouncements();
    const employeeId = req.user.employeeId;
    if (!employeeId) {
      return res.json({ data: [], unread: 0, pendingAcknowledgment: 0 });
    }

    const [[employee]] = await pool.query(
      'SELECT id, department_id, status FROM hrm_employees WHERE id = ? LIMIT 1',
      [employeeId]
    );
    if (!employee || employee.status === 'inactive') {
      return res.json({ data: [], unread: 0, pendingAcknowledgment: 0 });
    }

    const [rows] = await pool.query(
      `SELECT a.*, d.name AS department_name, u.name AS created_by_name,
              ac.acknowledged_at, ac.acknowledged_by,
              n.read_at
       FROM announcements a
       LEFT JOIN hrm_departments d ON d.id = a.department_id
       LEFT JOIN hrm_users u ON u.id = a.created_by
       LEFT JOIN announcement_acknowledgments ac
         ON ac.announcement_id = a.id AND ac.employee_id = ?
       LEFT JOIN hrm_notifications n
         ON n.recipient_user_id = ? AND n.dedupe_key = CONCAT('announcement-', a.id)
       WHERE a.status = 'published'
         AND (
           a.audience = 'everyone'
           OR (a.audience = 'roles' AND (a.department_id & ?) <> 0)
           OR (a.audience = 'department' AND a.department_id = ?)
         )
       ORDER BY a.published_at DESC, a.id DESC`,
      [employeeId, req.user.id, roleBit(req.user.role), Number(employee.department_id) || -1]
    );

    const data = rows.map(decorate);
    const unread = data.filter((row) => !row.read_at).length;
    const pendingAcknowledgment = data.filter((row) => Number(row.requires_acknowledgment) && !row.acknowledged_at).length;
    res.json({ data, unread, pendingAcknowledgment });
  })
);

router.post(
  '/my/:id/read',
  SELF,
  asyncHandler(async (req, res) => {
    const announcement = await loadAnnouncement(req.params.id);
    if (!announcement) throw new ApiError(404, 'Announcement not found.');
    if (announcement.status !== 'published' || !(await isAnnouncementTargeted(announcement, req.user.employeeId, req.user.role))) {
      throw new ApiError(403, 'This announcement is not available to you.');
    }

    const dedupe = `announcement-${announcement.id}`;
    const [result] = await pool.query(
      `UPDATE hrm_notifications SET read_at = ?
       WHERE recipient_user_id = ? AND dedupe_key = ? AND read_at IS NULL`,
      [sqlDateTime(), req.user.id, dedupe]
    );
    if (!result.affectedRows) {
      await pool.query(
        `INSERT INTO hrm_notifications
           (recipient_user_id, category, visibility_permission, title, message, related_path, dedupe_key, read_at)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE read_at = COALESCE(read_at, VALUES(read_at))`,
        [
          req.user.id,
          'announcement',
          'announcements.self',
          `New announcement: ${announcement.title}`.slice(0, 180),
          String(announcement.content || '').replace(/\s+/g, ' ').trim().slice(0, 500) || 'Open My announcements to read the full notice.',
          '/announcements/my',
          dedupe,
          sqlDateTime(),
        ]
      );
    }

    res.json({ message: 'Announcement marked as read.' });
  })
);

router.post(
  '/my/:id/acknowledge',
  SELF,
  asyncHandler(async (req, res) => {
    const announcement = await loadAnnouncement(req.params.id);
    if (!announcement) throw new ApiError(404, 'Announcement not found.');
    if (announcement.status !== 'published') throw new ApiError(400, 'This announcement is not published yet.');
    if (!Number(announcement.requires_acknowledgment)) {
      throw new ApiError(400, 'This announcement does not require acknowledgment.');
    }
    if (!req.user.employeeId) {
      throw new ApiError(400, 'Your account is not linked to an employee record.');
    }
    if (!(await isAnnouncementTargeted(announcement, req.user.employeeId, req.user.role))) {
      throw new ApiError(403, 'This announcement is not available to you.');
    }

    await pool.query(
      `INSERT IGNORE INTO announcement_acknowledgments
         (announcement_id, employee_id, acknowledged_by, acknowledged_at)
       VALUES (?,?,?,?)`,
      [announcement.id, req.user.employeeId, req.user.id, sqlDateTime()]
    );
    const [[row]] = await pool.query(
      `SELECT acknowledged_at FROM announcement_acknowledgments
       WHERE announcement_id = ? AND employee_id = ? LIMIT 1`,
      [announcement.id, req.user.employeeId]
    );
    res.json({
      message: 'Announcement acknowledged.',
      acknowledged_at: row?.acknowledged_at || null,
    });
  })
);

/* ------------------------------------------------------------------ */
/*  All announcements                                                 */
/* ------------------------------------------------------------------ */
router.get(
  '/',
  VIEW,
  asyncHandler(async (req, res) => {
    await publishDueAnnouncements();
    const [all] = await pool.query(
      `${ANNOUNCEMENT_SELECT}
       ORDER BY FIELD(a.status,'published','scheduled','draft','archived'), a.published_at DESC, a.created_at DESC`
    );
    let rows = all.map(decorate);

    const status = String(req.query.status || '').trim();
    if (status) rows = rows.filter((row) => row.status === status);
    const category = String(req.query.category || '').trim();
    if (category) rows = rows.filter((row) => row.category === category);
    const audience = String(req.query.audience || '').trim();
    if (audience) rows = rows.filter((row) => row.audience === audience);
    const departmentId = Number(req.query.departmentId || req.query.department_id);
    if (departmentId) rows = rows.filter((row) => Number(row.department_id) === departmentId);
    if (booleanValue(req.query.requiresAck ?? req.query.requires_ack)) {
      rows = rows.filter((row) => Number(row.requires_acknowledgment));
    }
    const search = String(req.query.search || '').trim().toLowerCase();
    if (search) {
      rows = rows.filter((row) =>
        `${row.title} ${row.content} ${row.category_label} ${row.audience_label} ${row.created_by_name || ''}`
          .toLowerCase()
          .includes(search)
      );
    }

    res.json(paginateRows(rows, req.query));
  })
);

router.post(
  '/',
  MANAGE,
  uploadDocumentMiddleware,
  asyncHandler(async (req, res) => {
    const payload = validatePayload(req);
    await assertDepartment(payload.departmentId, payload.audience);
    const attachment = await saveAttachment(req.file, { userId: req.user.id });
    const timing = statusForPayload(payload);

    let insertId;
    try {
      const [result] = await pool.query(
        `INSERT INTO announcements
           (title, content, category, audience, department_id, status, publish_at, published_at,
            requires_acknowledgment, attachment_provider, attachment_key, attachment_file_id,
            attachment_name, attachment_size, attachment_mime, created_by, updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          payload.title,
          payload.content,
          payload.category,
          payload.audience,
          payload.departmentId,
          timing.status,
          timing.publishAt,
          timing.publishedAt,
          payload.requiresAcknowledgment,
          attachment.attachment_provider,
          attachment.attachment_key,
          attachment.attachment_file_id,
          attachment.attachment_name,
          attachment.attachment_size,
          attachment.attachment_mime,
          req.user.id,
          req.user.id,
        ]
      );
      insertId = result.insertId;
    } catch (err) {
      if (attachment.attachment_key) {
        await deleteDocumentFile({
          provider: attachment.attachment_provider,
          key: attachment.attachment_key,
          fileId: attachment.attachment_file_id,
        });
      }
      throw err;
    }

    const created = await loadAnnouncement(insertId);
    if (created.status === 'published') await notifyAnnouncement(created);

    await audit(req, {
      action: 'announcements.create',
      entity: 'announcement',
      entityId: insertId,
      details: { title: created.title, status: created.status, audience: created.audience },
    });

    res.status(201).json({
      message:
        created.status === 'published'
          ? 'Announcement published.'
          : created.status === 'scheduled'
            ? 'Announcement scheduled.'
            : 'Announcement saved as a draft.',
      announcement: created,
    });
  })
);

/* ------------------------------------------------------------------ */
/*  Acknowledgment report for one announcement                        */
/* ------------------------------------------------------------------ */
router.get(
  '/reports/:id',
  REPORTS,
  asyncHandler(async (req, res) => {
    const announcement = await loadAnnouncement(req.params.id);
    if (!announcement) throw new ApiError(404, 'Announcement not found.');

    const rows = await targetEmployees(announcement);
    const stats = ackStats(rows);
    const search = String(req.query.search || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim();
    const departmentId = Number(req.query.departmentId || req.query.department_id);

    let filtered = rows;
    if (search) {
      filtered = filtered.filter((row) =>
        `${row.employee_name} ${row.employee_code} ${row.email} ${row.department_name || ''}`.toLowerCase().includes(search)
      );
    }
    if (status) filtered = filtered.filter((row) => row.status === status);
    if (departmentId) filtered = filtered.filter((row) => Number(row.department_id) === departmentId);

    res.json({
      announcement: {
        id: announcement.id,
        title: announcement.title,
        category: announcement.category,
        category_label: announcement.category_label,
        audience_label: announcement.audience_label,
        published_at: announcement.published_at,
        status: announcement.status,
        requires_acknowledgment: announcement.requires_acknowledgment,
      },
      stats,
      data: filtered,
    });
  })
);

/* ------------------------------------------------------------------ */
/*  Attachment                                                        */
/* ------------------------------------------------------------------ */
async function canReadAttachment(req, announcement) {
  if (req.permissions.includes('announcements.view')) return true;
  if (!req.permissions.includes('announcements.self')) return false;
  if (announcement.status !== 'published') return false;
  return isAnnouncementTargeted(announcement, req.user.employeeId, req.user.role);
}

async function sendAttachment(req, res, { inline }) {
  const announcement = await loadAnnouncement(req.params.id);
  if (!announcement) throw new ApiError(404, 'Announcement not found.');
  if (!(await canReadAttachment(req, announcement))) {
    throw new ApiError(403, 'This announcement is not available to you.');
  }
  if (!announcement.attachment_key) throw new ApiError(404, 'This announcement has no attachment.');

  if (!inline) {
    await audit(req, {
      action: 'announcements.attachment.download',
      entity: 'announcement',
      entityId: announcement.id,
      details: { name: announcement.attachment_name },
    });
  }

  const stored = await getDocumentStream({
    provider: announcement.attachment_provider,
    key: announcement.attachment_key,
    fileId: announcement.attachment_file_id,
  });
  const disposition = inline ? 'inline' : 'attachment';
  const safeName = String(announcement.attachment_name || 'attachment').replace(/["\r\n]/g, '_');
  res.setHeader('Content-Type', announcement.attachment_mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(safeName)}"`);
  if (stored.type === 'file') return res.sendFile(stored.path);
  return Readable.fromWeb(stored.response.body).pipe(res);
}

router.get('/:id/attachment/preview', VIEW_OR_SELF, asyncHandler((req, res) => sendAttachment(req, res, { inline: true })));
router.get('/:id/attachment/download', VIEW_OR_SELF, asyncHandler((req, res) => sendAttachment(req, res, { inline: false })));

/* ------------------------------------------------------------------ */
/*  Single announcement                                               */
/* ------------------------------------------------------------------ */
router.get(
  '/:id',
  VIEW_OR_SELF,
  asyncHandler(async (req, res) => {
    const announcement = await loadAnnouncement(req.params.id);
    if (!announcement) throw new ApiError(404, 'Announcement not found.');

    // Employees have no catalogue access, so limit them to published, targeted notices.
    if (!req.permissions.includes('announcements.view')) {
      const available =
        req.permissions.includes('announcements.self')
        && announcement.status === 'published'
        && (await isAnnouncementTargeted(announcement, req.user.employeeId, req.user.role));
      if (!available) throw new ApiError(403, 'This announcement is not available to you.');
    }

    if (req.user.employeeId) {
      const [[ack]] = await pool.query(
        `SELECT acknowledged_at FROM announcement_acknowledgments
         WHERE announcement_id = ? AND employee_id = ? LIMIT 1`,
        [announcement.id, req.user.employeeId]
      );
      announcement.acknowledged_at = ack?.acknowledged_at || null;
    }

    res.json({ announcement });
  })
);

router.put(
  '/:id',
  MANAGE,
  uploadDocumentMiddleware,
  asyncHandler(async (req, res) => {
    const existing = await loadAnnouncement(req.params.id);
    if (!existing) throw new ApiError(404, 'Announcement not found.');
    assertManageScope(req, existing);
    if (existing.status === 'archived') {
      throw new ApiError(400, 'Archived announcements cannot be edited.');
    }

    const payload = validatePayload(req, { existing });
    await assertDepartment(payload.departmentId, payload.audience);
    const timing = statusForPayload(payload, existing);
    const attachment = await saveAttachment(req.file, {
      current: existing,
      remove: payload.removeAttachment,
      userId: req.user.id,
    });

    const replacingAttachment =
      Boolean(existing.attachment_key) &&
      (!attachment.attachment_key || attachment.attachment_key !== existing.attachment_key);

    try {
      await pool.query(
        `UPDATE announcements SET
           title = ?, content = ?, category = ?, audience = ?, department_id = ?,
           status = ?, publish_at = ?, published_at = ?, requires_acknowledgment = ?,
           attachment_provider = ?, attachment_key = ?, attachment_file_id = ?,
           attachment_name = ?, attachment_size = ?, attachment_mime = ?, updated_by = ?
         WHERE id = ?`,
        [
          payload.title,
          payload.content,
          payload.category,
          payload.audience,
          payload.departmentId,
          timing.status,
          timing.publishAt,
          timing.publishedAt,
          payload.requiresAcknowledgment,
          attachment.attachment_provider,
          attachment.attachment_key,
          attachment.attachment_file_id,
          attachment.attachment_name,
          attachment.attachment_size,
          attachment.attachment_mime,
          req.user.id,
          existing.id,
        ]
      );
    } catch (err) {
      if (replacingAttachment && attachment.attachment_key) {
        await deleteDocumentFile({
          provider: attachment.attachment_provider,
          key: attachment.attachment_key,
          fileId: attachment.attachment_file_id,
        });
      }
      throw err;
    }

    if (replacingAttachment) {
      await deleteDocumentFile({
        provider: existing.attachment_provider,
        key: existing.attachment_key,
        fileId: existing.attachment_file_id,
      });
    }

    const updated = await loadAnnouncement(existing.id);
    const newlyPublished = existing.status !== 'published' && updated.status === 'published';
    if (newlyPublished || (existing.status === 'published' && Number(updated.requires_acknowledgment))) {
      await notifyAnnouncement(updated);
    }

    await audit(req, {
      action: 'announcements.update',
      entity: 'announcement',
      entityId: updated.id,
      details: { title: updated.title, status: updated.status },
    });

    res.json({ message: 'Announcement updated.', announcement: updated });
  })
);

router.post(
  '/:id/publish',
  MANAGE,
  asyncHandler(async (req, res) => {
    const existing = await loadAnnouncement(req.params.id);
    if (!existing) throw new ApiError(404, 'Announcement not found.');
    assertManageScope(req, existing);
    if (existing.status === 'archived') throw new ApiError(400, 'Archived announcements cannot be published.');
    if (existing.status === 'published') {
      return res.json({ message: 'Announcement is already published.', announcement: existing });
    }

    await pool.query(
      `UPDATE announcements
       SET status = 'published', published_at = COALESCE(published_at, ?), publish_at = COALESCE(publish_at, ?), updated_by = ?
       WHERE id = ?`,
      [sqlDateTime(), sqlDateTime(), req.user.id, existing.id]
    );
    const updated = await loadAnnouncement(existing.id);
    await notifyAnnouncement(updated);
    await audit(req, { action: 'announcements.publish', entity: 'announcement', entityId: updated.id });
    res.json({ message: 'Announcement published.', announcement: updated });
  })
);

router.post(
  '/:id/archive',
  MANAGE,
  asyncHandler(async (req, res) => {
    const existing = await loadAnnouncement(req.params.id);
    if (!existing) throw new ApiError(404, 'Announcement not found.');
    assertManageScope(req, existing);
    if (existing.status === 'archived') {
      return res.json({ message: 'Announcement is already archived.', announcement: existing });
    }
    await pool.query(
      `UPDATE announcements SET status = 'archived', archived_at = ?, updated_by = ? WHERE id = ?`,
      [sqlDateTime(), req.user.id, existing.id]
    );
    const updated = await loadAnnouncement(existing.id);
    await audit(req, { action: 'announcements.archive', entity: 'announcement', entityId: updated.id });
    res.json({ message: 'Announcement archived.', announcement: updated });
  })
);

router.delete(
  '/:id',
  MANAGE,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'super_admin') {
      throw new ApiError(403, 'Only a Super Admin can delete an announcement.');
    }
    const existing = await loadAnnouncement(req.params.id);
    if (!existing) throw new ApiError(404, 'Announcement not found.');

    if (existing.attachment_key) {
      await deleteDocumentFile({
        provider: existing.attachment_provider,
        key: existing.attachment_key,
        fileId: existing.attachment_file_id,
      });
    }
    await pool.query('DELETE FROM announcement_acknowledgments WHERE announcement_id = ?', [existing.id]);
    await pool.query(
      "DELETE FROM hrm_notifications WHERE dedupe_key = ? AND category = 'announcement'",
      [`announcement-${existing.id}`]
    );
    await pool.query('DELETE FROM announcements WHERE id = ?', [existing.id]);
    await audit(req, {
      action: 'announcements.delete',
      entity: 'announcement',
      entityId: existing.id,
      details: { title: existing.title },
    });
    res.json({ message: 'Announcement deleted.' });
  })
);

export default router;

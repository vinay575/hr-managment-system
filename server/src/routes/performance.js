import { Router } from 'express';
import pool from '../db.js';
import { asyncHandler, ApiError, isoDate } from '../utils.js';
import { authenticate, requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { audit } from '../audit.js';
import {
  uploadGoalAttachments,
  attachmentPath,
  hashFile,
  removeAttachment,
  removeUploadedFiles,
} from '../performance-files.js';
import { generatePerformanceReportPdf } from '../services/performance-pdf.js';

const router = Router();
router.use(authenticate);

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['not_started', 'in_progress', 'completed', 'on_hold', 'overdue', 'cancelled'];
const EDITABLE_STATUSES = ['not_started', 'in_progress', 'completed', 'on_hold'];
const PERIODS = ['monthly', 'quarterly', 'half_yearly', 'annually', 'custom'];
const CYCLE_STATUSES = ['draft', 'scheduled', 'active', 'completed', 'cancelled'];
const CYCLE_TRANSITIONS = {
  draft: ['scheduled', 'active', 'cancelled'],
  scheduled: ['active', 'draft', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const STATUS_LABEL = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  on_hold: 'On Hold',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

/** Overdue is always derived from the target date — never trusted from input. */
const EFFECTIVE_STATUS = `CASE
  WHEN g.status IN ('completed','cancelled') THEN g.status
  WHEN g.target_date < CURDATE() THEN 'overdue'
  ELSE g.status END`;

const GOAL_SELECT = `
  SELECT g.*, ${EFFECTIVE_STATUS} AS effective_status,
         CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
         e.employee_code, e.email AS employee_email, e.avatar_color,
         e.designation,
         d.name AS department_name, d.color AS department_color,
         u.name AS assigned_by_name, cu.name AS created_by_name,
         (SELECT COUNT(*) FROM performance_goal_attachments a WHERE a.goal_id = g.id) AS attachment_count,
         (SELECT COUNT(*) FROM performance_goal_updates gu WHERE gu.goal_id = g.id) AS update_count,
         (SELECT gu2.progress_notes FROM performance_goal_updates gu2
           WHERE gu2.goal_id = g.id ORDER BY gu2.created_at DESC, gu2.id DESC LIMIT 1) AS latest_note
  FROM performance_goals g
  JOIN hrm_employees e ON e.id = g.employee_id
  LEFT JOIN hrm_departments d ON d.id = g.department_id
  LEFT JOIN hrm_users u ON u.id = g.assigned_by
  LEFT JOIN hrm_users cu ON cu.id = g.created_by
`;

const CYCLE_SELECT = `
  SELECT c.*, d.name AS department_name, d.color AS department_color,
         u.name AS created_by_name,
         (SELECT COUNT(*) FROM performance_review_cycle_employees ce WHERE ce.cycle_id = c.id) AS employee_count,
         (SELECT COUNT(*) FROM performance_goals g
            JOIN performance_review_cycle_employees ce ON ce.employee_id = g.employee_id AND ce.cycle_id = c.id
           WHERE g.target_date BETWEEN c.start_date AND c.end_date) AS total_goals,
         (SELECT COUNT(*) FROM performance_goals g
            JOIN performance_review_cycle_employees ce ON ce.employee_id = g.employee_id AND ce.cycle_id = c.id
           WHERE g.target_date BETWEEN c.start_date AND c.end_date AND g.status = 'completed') AS completed_goals,
         (SELECT COUNT(*) FROM performance_goals g
            JOIN performance_review_cycle_employees ce ON ce.employee_id = g.employee_id AND ce.cycle_id = c.id
           WHERE g.target_date BETWEEN c.start_date AND c.end_date
             AND g.status NOT IN ('completed','cancelled')) AS pending_goals,
         (SELECT COUNT(*) FROM performance_goals g
            JOIN performance_review_cycle_employees ce ON ce.employee_id = g.employee_id AND ce.cycle_id = c.id
           WHERE g.target_date BETWEEN c.start_date AND c.end_date
             AND g.status NOT IN ('completed','cancelled') AND g.target_date < CURDATE()) AS overdue_goals
  FROM performance_review_cycles c
  LEFT JOIN hrm_departments d ON d.id = c.department_id
  LEFT JOIN hrm_users u ON u.id = c.created_by
`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const num = (v) => Number(v) || 0;

function cleanText(value, max = 1000) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

function parseDate(value, label = 'date') {
  const s = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ApiError(400, `Please enter a valid ${label}.`);
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, `Please enter a valid ${label}.`);
  return s;
}

function parsePriority(value) {
  const p = String(value || '').toLowerCase();
  if (!PRIORITIES.includes(p)) throw new ApiError(400, 'Please choose a valid priority.');
  return p;
}

function parsePercentage(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new ApiError(400, 'Progress must be between 0 and 100.');
  return Math.round(n * 100) / 100;
}

function parsePositiveId(value, label = 'record') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, `Please choose a valid ${label}.`);
  return n;
}

function canViewAllGoals(req) {
  // Employees are always limited to their own goals, even if a stale or
  // misconfigured permission row would otherwise grant broader visibility.
  return (
    req.user.role !== 'employee' &&
    (req.permissions.includes('performance.goals.view') || req.permissions.includes('performance.goals.manage'))
  );
}

function canManageGoals(req) {
  return req.permissions.includes('performance.goals.manage');
}

function canViewCycles(req) {
  return req.permissions.includes('performance.reviews.view') || req.permissions.includes('performance.reviews.manage');
}

function canManageCycles(req) {
  return req.permissions.includes('performance.reviews.manage');
}

function resolveRange(query) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (query.range) {
    case 'this_month':
      return { from: isoDate(new Date(y, m, 1)), to: isoDate(new Date(y, m + 1, 0)) };
    case 'last_month':
      return { from: isoDate(new Date(y, m - 1, 1)), to: isoDate(new Date(y, m, 0)) };
    case 'last_3_months':
      return { from: isoDate(new Date(y, m - 2, 1)), to: isoDate(new Date(y, m + 1, 0)) };
    case 'this_year':
      return { from: isoDate(new Date(y, 0, 1)), to: isoDate(new Date(y, 11, 31)) };
    case 'custom':
      return { from: query.from || null, to: query.to || null };
    default:
      return { from: query.from || null, to: query.to || null };
  }
}

async function loadGoal(req, id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  const [rows] = await pool.query(`${GOAL_SELECT} WHERE g.id = ? LIMIT 1`, [numericId]);
  const goal = rows[0] || null;
  if (!goal) return null;
  if (!canViewAllGoals(req) && goal.employee_id !== req.user.employeeId) {
    throw new ApiError(403, 'You can only access your own goals.');
  }
  return goal;
}

async function loadCycle(req, id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  const [rows] = await pool.query(`${CYCLE_SELECT} WHERE c.id = ? LIMIT 1`, [numericId]);
  const cycle = rows[0] || null;
  if (!cycle) return null;
  if (!canViewAllCycles(req)) {
    const [[member]] = await pool.query(
      'SELECT COUNT(*) AS count FROM performance_review_cycle_employees WHERE cycle_id = ? AND employee_id = ?',
      [numericId, req.user.employeeId || 0]
    );
    if (!Number(member.count)) throw new ApiError(403, 'You do not have access to this review cycle.');
  }
  return cycle;
}

function canViewAllCycles(req) {
  return (
    req.user.role !== 'employee' &&
    (req.permissions.includes('performance.reviews.view') || req.permissions.includes('performance.reviews.manage'))
  );
}

async function logActivity(conn, { userId, goalId = null, cycleId = null, action, description = null, oldStatus = null, newStatus = null }) {
  await conn.query(
    `INSERT INTO performance_activity_logs (user_id, goal_id, cycle_id, action, description, old_status, new_status)
     VALUES (?,?,?,?,?,?,?)`,
    [userId || null, goalId, cycleId, action, description ? String(description).slice(0, 500) : null, oldStatus, newStatus]
  );
}

async function recordGoalUpdate(conn, { goalId, userId, previousStatus, newStatus, previousPercentage, newPercentage, notes }) {
  const [result] = await conn.query(
    `INSERT INTO performance_goal_updates
       (goal_id, previous_status, new_status, previous_percentage, new_percentage, progress_notes, updated_by)
     VALUES (?,?,?,?,?,?,?)`,
    [goalId, previousStatus, newStatus, previousPercentage, newPercentage, cleanText(notes, 4000), userId || null]
  );
  return result.insertId;
}

async function saveGoalAttachments(conn, { goalId, updateId = null, files, userId }) {
  const saved = [];
  for (const file of files || []) {
    const full = attachmentPath(file.filename);
    const hash = hashFile(full);
    const [result] = await conn.query(
      `INSERT INTO performance_goal_attachments
         (goal_id, update_id, file_name, stored_name, file_type, file_size, file_hash, uploaded_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [goalId, updateId, file.originalname, file.filename, file.mimetype, file.size, hash, userId || null]
    );
    saved.push(result.insertId);
  }
  return saved;
}

async function assertEmployeeIds(conn, ids) {
  const unique = [...new Set(ids.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0))];
  if (!unique.length) throw new ApiError(400, 'Please choose at least one employee.');
  const placeholders = unique.map(() => '?').join(',');
  const [rows] = await conn.query(
    `SELECT id, first_name, last_name, department_id FROM hrm_employees WHERE id IN (${placeholders})`,
    unique
  );
  if (rows.length !== unique.length) throw new ApiError(400, 'One or more selected employees could not be found.');
  return rows;
}

async function assertDepartment(conn, id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) throw new ApiError(400, 'Please choose a valid department.');
  const [rows] = await conn.query('SELECT id, name FROM hrm_departments WHERE id = ? LIMIT 1', [numericId]);
  if (!rows[0]) throw new ApiError(400, 'Please choose a valid department.');
  return rows[0];
}

/** Normalise a status/progress pair and enforce the documented business rules. */
function normaliseStatusProgress(status, percentage, currentStatus, currentPercentage) {
  let nextStatus = status;
  let nextPercentage = percentage;

  if (!EDITABLE_STATUSES.includes(nextStatus)) {
    if (nextStatus === 'overdue') throw new ApiError(400, 'Overdue is calculated automatically from the target date.');
    if (nextStatus === 'cancelled') throw new ApiError(400, 'Use the cancel action to cancel a goal.');
    throw new ApiError(400, 'Please choose a valid goal status.');
  }

  if (nextStatus === 'completed') {
    nextPercentage = 100;
  } else if (nextStatus === 'not_started') {
    nextPercentage = 0;
  } else if (nextStatus === 'on_hold') {
    nextPercentage = nextPercentage == null ? num(currentPercentage) : nextPercentage;
  } else if (nextStatus === 'in_progress') {
    if (nextPercentage == null) {
      nextPercentage = num(currentPercentage) > 0 && num(currentPercentage) < 100 ? num(currentPercentage) : 1;
    }
    if (!(nextPercentage > 0 && nextPercentage < 100)) {
      throw new ApiError(400, 'In-progress goals need progress between 1% and 99%.');
    }
  }

  return { status: nextStatus, percentage: nextPercentage == null ? 0 : nextPercentage };
}

const goalStatusFilterSql = (status) => {
  const s = String(status || '');
  if (!STATUSES.includes(s)) return null;
  return `(${EFFECTIVE_STATUS}) = '${s}'`;
};

function goalFilters(req, { scope = true } = {}) {
  const where = [];
  const params = [];
  if (scope && !canViewAllGoals(req)) {
    where.push('g.employee_id = ?');
    params.push(req.user.employeeId || 0);
  }
  if (req.query.employeeId) {
    const employeeId = Number(req.query.employeeId);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      throw new ApiError(400, 'Please choose a valid employee.');
    }
    if (!canViewAllGoals(req) && employeeId !== Number(req.user.employeeId)) {
      throw new ApiError(403, 'You can only access your own goals.');
    }
    where.push('g.employee_id = ?');
    params.push(employeeId);
  }
  if (req.query.departmentId) {
    where.push('g.department_id = ?');
    params.push(Number(req.query.departmentId));
  }
  if (req.query.priority) {
    const priority = String(req.query.priority);
    if (PRIORITIES.includes(priority)) {
      where.push('g.priority = ?');
      params.push(priority);
    }
  }
  if (req.query.status) {
    const sql = goalStatusFilterSql(req.query.status);
    if (sql) where.push(sql);
  }
  if (req.query.from) {
    where.push('g.target_date >= ?');
    params.push(String(req.query.from).slice(0, 10));
  }
  if (req.query.to) {
    where.push('g.target_date <= ?');
    params.push(String(req.query.to).slice(0, 10));
  }
  const search = String(req.query.search || '').trim();
  if (search) {
    where.push('(g.title LIKE ? OR g.goal_code LIKE ? OR CONCAT(e.first_name, " ", e.last_name) LIKE ?)');
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */
router.get(
  '/dashboard',
  requireAnyPermission('performance.dashboard', 'performance.goals.self'),
  asyncHandler(async (req, res) => {
    const scopeAll = canViewAllGoals(req);
    const { from, to } = resolveRange(req.query);
    const where = [];
    const params = [];
    if (!scopeAll) {
      where.push('g.employee_id = ?');
      params.push(req.user.employeeId || 0);
    }
    if (from) {
      where.push('DATE(g.created_at) >= ?');
      params.push(from);
    }
    if (to) {
      where.push('DATE(g.created_at) <= ?');
      params.push(to);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[stats]] = await pool.query(
      `SELECT COUNT(*) AS total_goals,
              COALESCE(SUM(${EFFECTIVE_STATUS} = 'in_progress'), 0) AS in_progress,
              COALESCE(SUM(${EFFECTIVE_STATUS} = 'completed'), 0) AS completed,
              COALESCE(SUM(${EFFECTIVE_STATUS} IN ('not_started','on_hold')), 0) AS pending,
              COALESCE(SUM(${EFFECTIVE_STATUS} = 'overdue'), 0) AS overdue,
              COALESCE(SUM(${EFFECTIVE_STATUS} = 'cancelled'), 0) AS cancelled
       FROM performance_goals g ${clause}`,
      params
    );

    let employeeCount = null;
    if (scopeAll) {
      const [[row]] = await pool.query("SELECT COUNT(*) AS count FROM hrm_employees WHERE status <> 'inactive'");
      employeeCount = row;
    }

    let activeCycles = 0;
    let completedCycles = 0;
    if (scopeAll) {
      const [[cycles]] = await pool.query(
        `SELECT COALESCE(SUM(status = 'active'), 0) AS active, COALESCE(SUM(status = 'completed'), 0) AS completed
         FROM performance_review_cycles`
      );
      activeCycles = num(cycles.active);
      completedCycles = num(cycles.completed);
    } else if (req.user.employeeId) {
      const [[cycles]] = await pool.query(
        `SELECT COALESCE(SUM(c.status = 'active'), 0) AS active, COALESCE(SUM(c.status = 'completed'), 0) AS completed
         FROM performance_review_cycles c
         JOIN performance_review_cycle_employees ce ON ce.cycle_id = c.id
         WHERE ce.employee_id = ?`,
        [req.user.employeeId]
      );
      activeCycles = num(cycles.active);
      completedCycles = num(cycles.completed);
    }

    const [statusBreakdown] = await pool.query(
      `SELECT ${EFFECTIVE_STATUS} AS status, COUNT(*) AS count
       FROM performance_goals g ${clause}
       GROUP BY ${EFFECTIVE_STATUS}`,
      params
    );

    const trendWhere = ["g.status = 'completed'", 'g.completed_at IS NOT NULL', 'g.completed_at >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)'];
    const trendParams = [];
    if (!scopeAll) {
      trendWhere.push('g.employee_id = ?');
      trendParams.push(req.user.employeeId || 0);
    }
    const [monthly] = await pool.query(
      `SELECT DATE_FORMAT(g.completed_at, '%Y-%m') AS month, COUNT(*) AS count
       FROM performance_goals g WHERE ${trendWhere.join(' AND ')}
       GROUP BY DATE_FORMAT(g.completed_at, '%Y-%m') ORDER BY month`,
      trendParams
    );

    let byDepartment = [];
    if (scopeAll) {
      const [rows] = await pool.query(
        `SELECT COALESCE(d.name, 'Unassigned') AS name, COALESCE(d.color, 'indigo') AS color,
                COUNT(*) AS total, COALESCE(SUM(${EFFECTIVE_STATUS} = 'completed'), 0) AS completed
         FROM performance_goals g LEFT JOIN hrm_departments d ON d.id = g.department_id
         ${clause}
         GROUP BY COALESCE(d.name, 'Unassigned'), COALESCE(d.color, 'indigo')
         ORDER BY total DESC, name ASC`,
        params
      );
      byDepartment = rows;
    }

    const activityWhere = [];
    const activityParams = [];
    if (!scopeAll) {
      activityWhere.push(
        '(a.goal_id IN (SELECT id FROM performance_goals WHERE employee_id = ?) OR a.cycle_id IN (SELECT cycle_id FROM performance_review_cycle_employees WHERE employee_id = ?))'
      );
      activityParams.push(req.user.employeeId || 0, req.user.employeeId || 0);
    }
    if (from) {
      activityWhere.push('DATE(a.created_at) >= ?');
      activityParams.push(from);
    }
    if (to) {
      activityWhere.push('DATE(a.created_at) <= ?');
      activityParams.push(to);
    }
    const [recentActivities] = await pool.query(
      `SELECT a.*, u.name AS user_name, g.title AS goal_title, g.goal_code, c.cycle_name
       FROM performance_activity_logs a
       LEFT JOIN hrm_users u ON u.id = a.user_id
       LEFT JOIN performance_goals g ON g.id = a.goal_id
       LEFT JOIN performance_review_cycles c ON c.id = a.cycle_id
       ${activityWhere.length ? `WHERE ${activityWhere.join(' AND ')}` : ''}
       ORDER BY a.created_at DESC, a.id DESC LIMIT 8`,
      activityParams
    );

    res.json({
      scope: scopeAll ? 'organisation' : 'personal',
      range: { from, to },
      stats: {
        ...(scopeAll ? { totalEmployees: num(employeeCount?.count) } : {}),
        totalGoals: num(stats.total_goals),
        inProgress: num(stats.in_progress),
        completed: num(stats.completed),
        pending: num(stats.pending),
        overdue: num(stats.overdue),
        cancelled: num(stats.cancelled),
        activeReviewCycles: activeCycles,
        completedReviewCycles: completedCycles,
      },
      statusBreakdown: STATUSES.map((status) => ({
        status,
        count: num((statusBreakdown.find((s) => s.status === status) || {}).count),
      })),
      monthly,
      byDepartment,
      recentActivities,
    });
  })
);

/* ------------------------------------------------------------------ */
/*  Goals                                                              */
/* ------------------------------------------------------------------ */
router.get(
  '/goals',
  requireAnyPermission('performance.goals.view', 'performance.goals.manage', 'performance.goals.self'),
  asyncHandler(async (req, res) => {
    const { clause, params } = goalFilters(req);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const page = Math.max(1, Number(req.query.page) || 1);
    const sort = String(req.query.sort || 'created');
    const orderBy =
      sort === 'target'
        ? 'g.target_date ASC, g.id DESC'
        : sort === 'progress'
          ? 'g.progress_percentage DESC, g.target_date ASC'
          : sort === 'employee'
            ? 'e.first_name ASC, e.last_name ASC'
            : 'g.created_at DESC, g.id DESC';

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM performance_goals g JOIN hrm_employees e ON e.id = g.employee_id ${clause}`,
      params
    );
    const [rows] = await pool.query(
      `${GOAL_SELECT} ${clause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );

    const statsWhere = [];
    const statsParams = [];
    if (!canViewAllGoals(req)) {
      statsWhere.push('g.employee_id = ?');
      statsParams.push(req.user.employeeId || 0);
    }
    const [[stats]] = await pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(${EFFECTIVE_STATUS} = 'not_started'),0) AS not_started,
              COALESCE(SUM(${EFFECTIVE_STATUS} = 'in_progress'),0) AS in_progress,
              COALESCE(SUM(${EFFECTIVE_STATUS} = 'completed'),0) AS completed,
              COALESCE(SUM(${EFFECTIVE_STATUS} = 'on_hold'),0) AS on_hold,
              COALESCE(SUM(${EFFECTIVE_STATUS} = 'overdue'),0) AS overdue,
              COALESCE(SUM(${EFFECTIVE_STATUS} = 'cancelled'),0) AS cancelled
       FROM performance_goals g ${statsWhere.length ? `WHERE ${statsWhere.join(' AND ')}` : ''}`,
      statsParams
    );

    res.json({
      data: rows,
      page,
      pages: Math.ceil(num(countRow.total) / limit) || 0,
      total: num(countRow.total),
      stats: {
        total: num(stats.total),
        notStarted: num(stats.not_started),
        inProgress: num(stats.in_progress),
        completed: num(stats.completed),
        onHold: num(stats.on_hold),
        overdue: num(stats.overdue),
        cancelled: num(stats.cancelled),
      },
    });
  })
);

router.get(
  '/goals/my',
  requirePermission('performance.goals.self'),
  asyncHandler(async (req, res) => {
    if (!req.user.employeeId) {
      return res.json({ data: [], page: 1, pages: 0, total: 0, stats: {}, scope: 'personal' });
    }
    const where = ['g.employee_id = ?'];
    const params = [req.user.employeeId];
    if (req.query.status) {
      const sql = goalStatusFilterSql(req.query.status);
      if (sql) where.push(sql);
    }
    if (req.query.priority) {
      const priority = String(req.query.priority);
      if (PRIORITIES.includes(priority)) {
        where.push('g.priority = ?');
        params.push(priority);
      }
    }
    const search = String(req.query.search || '').trim();
    if (search) {
      where.push('(g.title LIKE ? OR g.goal_code LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const clause = `WHERE ${where.join(' AND ')}`;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const page = Math.max(1, Number(req.query.page) || 1);
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM performance_goals g ${clause}`,
      params
    );
    const [rows] = await pool.query(
      `${GOAL_SELECT} ${clause} ORDER BY g.target_date ASC, g.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );
    const [[stats]] = await pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(${EFFECTIVE_STATUS} = 'not_started'),0) AS not_started,
              COALESCE(SUM(${EFFECTIVE_STATUS} = 'in_progress'),0) AS in_progress,
              COALESCE(SUM(${EFFECTIVE_STATUS} = 'completed'),0) AS completed,
              COALESCE(SUM(${EFFECTIVE_STATUS} = 'on_hold'),0) AS on_hold,
              COALESCE(SUM(${EFFECTIVE_STATUS} = 'overdue'),0) AS overdue,
              COALESCE(SUM(${EFFECTIVE_STATUS} = 'cancelled'),0) AS cancelled
       FROM performance_goals g WHERE g.employee_id = ?`,
      [req.user.employeeId]
    );
    res.json({
      data: rows,
      page,
      pages: Math.ceil(num(countRow.total) / limit) || 0,
      total: num(countRow.total),
      scope: 'personal',
      stats: {
        total: num(stats.total),
        notStarted: num(stats.not_started),
        inProgress: num(stats.in_progress),
        completed: num(stats.completed),
        onHold: num(stats.on_hold),
        overdue: num(stats.overdue),
        cancelled: num(stats.cancelled),
      },
    });
  })
);

router.get(
  '/goals/:id',
  requireAnyPermission('performance.goals.view', 'performance.goals.manage', 'performance.goals.self'),
  asyncHandler(async (req, res) => {
    const goal = await loadGoal(req, req.params.id);
    if (!goal) throw new ApiError(404, 'Goal not found.');

    const [updates] = await pool.query(
      `SELECT gu.*, u.name AS updated_by_name
       FROM performance_goal_updates gu LEFT JOIN hrm_users u ON u.id = gu.updated_by
       WHERE gu.goal_id = ? ORDER BY gu.created_at DESC, gu.id DESC`,
      [goal.id]
    );
    const [attachments] = await pool.query(
      `SELECT a.id, a.goal_id, a.update_id, a.file_name, a.file_type, a.file_size, a.created_at, u.name AS uploaded_by_name
       FROM performance_goal_attachments a LEFT JOIN hrm_users u ON u.id = a.uploaded_by
       WHERE a.goal_id = ? ORDER BY a.created_at DESC`,
      [goal.id]
    );
    const [activities] = await pool.query(
      `SELECT a.*, u.name AS user_name FROM performance_activity_logs a
       LEFT JOIN hrm_users u ON u.id = a.user_id
       WHERE a.goal_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 50`,
      [goal.id]
    );
    const [cycleRows] = await pool.query(
      `SELECT c.id, c.cycle_name, c.status, c.start_date, c.end_date, c.review_period
       FROM performance_review_cycles c
       JOIN performance_review_cycle_employees ce ON ce.cycle_id = c.id
       WHERE ce.employee_id = ? AND c.start_date <= ? AND c.end_date >= ?
       ORDER BY c.start_date DESC`,
      [goal.employee_id, goal.target_date, goal.target_date]
    );
    res.json({ goal, updates, attachments, activities, linkedCycles: cycleRows });
  })
);

router.post(
  '/goals',
  requirePermission('performance.goals.manage'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const title = cleanText(body.title, 180);
    const description = cleanText(body.description, 8000);
    if (!title) throw new ApiError(400, 'Goal title is required.');
    if (!description) throw new ApiError(400, 'Goal description is required.');
    const startDate = parseDate(body.startDate, 'start date');
    const targetDate = parseDate(body.targetDate, 'target completion date');
    if (targetDate < startDate) throw new ApiError(400, 'Target completion date cannot be earlier than the start date.');
    const priority = parsePriority(body.priority || 'medium');
    const requestedStatus = String(body.status || 'not_started');
    if (!['not_started', 'in_progress', 'on_hold', 'completed'].includes(requestedStatus)) {
      throw new ApiError(400, 'Please choose a valid goal status.');
    }
    const additionalNotes = cleanText(body.additionalNotes, 8000);
    const instructions = cleanText(body.instructions, 8000);
    const rawEmployees = Array.isArray(body.employeeIds) ? body.employeeIds : [body.employeeId];
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const employees = await assertEmployeeIds(conn, rawEmployees);
      const department = body.departmentId
        ? await assertDepartment(conn, body.departmentId)
        : null;
      const createdIds = [];
      for (const employee of employees) {
        const departmentId = department ? department.id : employee.department_id || null;
        const baseProgress = requestedStatus === 'completed' ? 100 : requestedStatus === 'in_progress' ? 1 : 0;
        const [result] = await conn.query(
          `INSERT INTO performance_goals
             (goal_code, title, description, employee_id, department_id, assigned_by, start_date, target_date,
              priority, status, progress_percentage, instructions, additional_notes, completed_at, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            `PG-TMP-${Date.now()}-${employee.id}`,
            title,
            description,
            employee.id,
            departmentId,
            req.user.id,
            startDate,
            targetDate,
            priority,
            requestedStatus,
            baseProgress,
            instructions,
            additionalNotes,
            requestedStatus === 'completed' ? new Date() : null,
            req.user.id,
          ]
        );
        const goalId = result.insertId;
        const goalCode = `PG-${String(goalId).padStart(6, '0')}`;
        await conn.query('UPDATE performance_goals SET goal_code = ? WHERE id = ?', [goalCode, goalId]);
        await recordGoalUpdate(conn, {
          goalId,
          userId: req.user.id,
          previousStatus: null,
          newStatus: requestedStatus,
          previousPercentage: null,
          newPercentage: baseProgress,
          notes: 'Goal created and assigned.',
        });
        await logActivity(conn, {
          userId: req.user.id,
          goalId,
          action: 'goal_created',
          description: `Goal "${title}" assigned to ${employee.first_name} ${employee.last_name}.`,
          newStatus: requestedStatus,
        });
        createdIds.push(goalId);
      }
      await conn.commit();
      const placeholders = createdIds.map(() => '?').join(',');
      const [rows] = await pool.query(`${GOAL_SELECT} WHERE g.id IN (${placeholders})`, createdIds);
      res.status(201).json({ data: rows, count: rows.length });
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  })
);

router.put(
  '/goals/:id',
  requirePermission('performance.goals.manage'),
  asyncHandler(async (req, res) => {
    const goal = await loadGoal(req, req.params.id);
    if (!goal) throw new ApiError(404, 'Goal not found.');
    if (goal.status === 'cancelled') throw new ApiError(400, 'Cancelled goals are preserved for history and cannot be edited.');

    const body = req.body || {};
    const next = {
      title: body.title !== undefined ? cleanText(body.title, 180) : goal.title,
      description: body.description !== undefined ? cleanText(body.description, 8000) : goal.description,
      startDate: body.startDate !== undefined ? parseDate(body.startDate, 'start date') : String(goal.start_date).slice(0, 10),
      targetDate: body.targetDate !== undefined ? parseDate(body.targetDate, 'target completion date') : String(goal.target_date).slice(0, 10),
      priority: body.priority !== undefined ? parsePriority(body.priority) : goal.priority,
      additionalNotes: body.additionalNotes !== undefined ? cleanText(body.additionalNotes, 8000) : goal.additional_notes,
      instructions: body.instructions !== undefined ? cleanText(body.instructions, 8000) : goal.instructions,
    };
    if (!next.title) throw new ApiError(400, 'Goal title is required.');
    if (!next.description) throw new ApiError(400, 'Goal description is required.');
    if (next.targetDate < next.startDate) throw new ApiError(400, 'Target completion date cannot be earlier than the start date.');

    let nextStatus = goal.status;
    let nextPercentage = num(goal.progress_percentage);
    if (body.status !== undefined && body.status !== goal.status) {
      const normalised = normaliseStatusProgress(String(body.status), parsePercentage(body.progressPercentage), goal.status, goal.progress_percentage);
      nextStatus = normalised.status;
      nextPercentage = normalised.percentage;
    } else if (body.progressPercentage !== undefined) {
      const pct = parsePercentage(body.progressPercentage);
      nextPercentage = pct == null ? nextPercentage : pct;
      if (nextStatus === 'completed') nextPercentage = 100;
      if (nextStatus === 'not_started') nextPercentage = 0;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      let departmentId = goal.department_id;
      if (body.departmentId !== undefined) {
        const department = body.departmentId ? await assertDepartment(conn, body.departmentId) : null;
        departmentId = department ? department.id : null;
      }
      const completedAt =
        nextStatus === 'completed'
          ? goal.completed_at || new Date()
          : goal.status === 'completed'
            ? null
            : goal.completed_at;
      await conn.query(
        `UPDATE performance_goals
         SET title = ?, description = ?, department_id = ?, start_date = ?, target_date = ?, priority = ?,
             status = ?, progress_percentage = ?, instructions = ?, additional_notes = ?, completed_at = ?
         WHERE id = ?`,
        [
          next.title,
          next.description,
          departmentId,
          next.startDate,
          next.targetDate,
          next.priority,
          nextStatus,
          nextPercentage,
          next.instructions,
          next.additionalNotes,
          completedAt,
          goal.id,
        ]
      );

      const statusChanged = nextStatus !== goal.status;
      const percentageChanged = Number(nextPercentage) !== Number(goal.progress_percentage);
      if (statusChanged || percentageChanged) {
        await recordGoalUpdate(conn, {
          goalId: goal.id,
          userId: req.user.id,
          previousStatus: goal.status,
          newStatus: nextStatus,
          previousPercentage: goal.progress_percentage,
          newPercentage: nextPercentage,
          notes: cleanText(body.progressNotes, 4000) || 'Goal updated by manager.',
        });
      }
      if (statusChanged) {
        await logActivity(conn, {
          userId: req.user.id,
          goalId: goal.id,
          action: nextStatus === 'completed' ? 'goal_completed' : 'status_changed',
          description: `Status changed from ${STATUS_LABEL[goal.status] || goal.status} to ${STATUS_LABEL[nextStatus] || nextStatus}.`,
          oldStatus: goal.status,
          newStatus: nextStatus,
        });
      }
      if (next.targetDate !== String(goal.target_date).slice(0, 10)) {
        const extended = next.targetDate > String(goal.target_date).slice(0, 10);
        await logActivity(conn, {
          userId: req.user.id,
          goalId: goal.id,
          action: extended ? 'target_extended' : 'target_changed',
          description: `Target date ${extended ? 'extended' : 'changed'} from ${String(goal.target_date).slice(0, 10)} to ${next.targetDate}.`,
        });
      }
      await logActivity(conn, {
        userId: req.user.id,
        goalId: goal.id,
        action: 'goal_updated',
        description: 'Goal details updated.',
      });
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }

    const updated = await loadGoal(req, req.params.id);
    await audit(req, { action: 'performance.goal.update', entity: 'performance_goal', entityId: goal.id, details: { title: next.title } });
    res.json({ goal: updated });
  })
);

router.patch(
  '/goals/:id/status',
  requirePermission('performance.goals.manage'),
  asyncHandler(async (req, res) => {
    const goal = await loadGoal(req, req.params.id);
    if (!goal) throw new ApiError(404, 'Goal not found.');
    if (goal.status === 'cancelled') throw new ApiError(400, 'Cancelled goals cannot change status.');
    const normalised = normaliseStatusProgress(
      String((req.body || {}).status || ''),
      parsePercentage((req.body || {}).progressPercentage),
      goal.status,
      goal.progress_percentage
    );
    if (normalised.status === goal.status && Number(normalised.percentage) === Number(goal.progress_percentage)) {
      throw new ApiError(400, 'The goal already has this status and progress.');
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        'UPDATE performance_goals SET status = ?, progress_percentage = ?, completed_at = ? WHERE id = ?',
        [
          normalised.status,
          normalised.percentage,
          normalised.status === 'completed' ? goal.completed_at || new Date() : null,
          goal.id,
        ]
      );
      await recordGoalUpdate(conn, {
        goalId: goal.id,
        userId: req.user.id,
        previousStatus: goal.status,
        newStatus: normalised.status,
        previousPercentage: goal.progress_percentage,
        newPercentage: normalised.percentage,
        notes: cleanText((req.body || {}).notes, 4000) || `Status set to ${STATUS_LABEL[normalised.status] || normalised.status}.`,
      });
      await logActivity(conn, {
        userId: req.user.id,
        goalId: goal.id,
        action: normalised.status === 'completed' ? 'goal_completed' : 'status_changed',
        description: `Status changed from ${STATUS_LABEL[goal.status] || goal.status} to ${STATUS_LABEL[normalised.status] || normalised.status}.`,
        oldStatus: goal.status,
        newStatus: normalised.status,
      });
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
    const updated = await loadGoal(req, req.params.id);
    res.json({ goal: updated });
  })
);

router.post(
  '/goals/:id/cancel',
  requirePermission('performance.goals.manage'),
  asyncHandler(async (req, res) => {
    const goal = await loadGoal(req, req.params.id);
    if (!goal) throw new ApiError(404, 'Goal not found.');
    if (goal.status === 'cancelled') throw new ApiError(400, 'This goal is already cancelled.');
    if (goal.status === 'completed') throw new ApiError(400, 'Completed goals are preserved and cannot be cancelled.');
    const reason = cleanText((req.body || {}).reason, 4000);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        "UPDATE performance_goals SET status = 'cancelled', cancelled_at = NOW() WHERE id = ?",
        [goal.id]
      );
      await recordGoalUpdate(conn, {
        goalId: goal.id,
        userId: req.user.id,
        previousStatus: goal.status,
        newStatus: 'cancelled',
        previousPercentage: goal.progress_percentage,
        newPercentage: goal.progress_percentage,
        notes: reason || 'Goal cancelled.',
      });
      await logActivity(conn, {
        userId: req.user.id,
        goalId: goal.id,
        action: 'goal_cancelled',
        description: reason || 'Goal cancelled. Historical progress preserved.',
        oldStatus: goal.status,
        newStatus: 'cancelled',
      });
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
    const updated = await loadGoal(req, req.params.id);
    await audit(req, { action: 'performance.goal.cancel', entity: 'performance_goal', entityId: goal.id });
    res.json({ goal: updated });
  })
);

router.post(
  '/goals/:id/progress',
  requireAnyPermission('performance.goals.self', 'performance.goals.manage'),
  uploadGoalAttachments,
  asyncHandler(async (req, res) => {
    const files = req.files || [];
    try {
      const goal = await loadGoal(req, req.params.id);
      if (!goal) throw new ApiError(404, 'Goal not found.');
      if (!canManageGoals(req) && goal.employee_id !== req.user.employeeId) {
        throw new ApiError(403, 'You can only update progress on your own goals.');
      }
      if (goal.status === 'cancelled') throw new ApiError(400, 'Cancelled goals are preserved and cannot be updated.');
      const body = req.body || {};
      const percentageInput = parsePercentage(body.progressPercentage);
      let requestedStatus = body.status ? String(body.status) : null;
      if (requestedStatus && !EDITABLE_STATUSES.includes(requestedStatus)) {
        if (requestedStatus === 'overdue') throw new ApiError(400, 'Overdue is calculated automatically from the target date.');
        throw new ApiError(400, 'Please choose a valid goal status.');
      }
      if (!requestedStatus) {
        if (percentageInput == null) throw new ApiError(400, 'Please provide a progress percentage.');
        if (percentageInput === 100) requestedStatus = 'completed';
        else if (percentageInput === 0) requestedStatus = 'not_started';
        else requestedStatus = 'in_progress';
      }
      const normalised = normaliseStatusProgress(
        requestedStatus,
        percentageInput == null ? num(goal.progress_percentage) : percentageInput,
        goal.status,
        goal.progress_percentage
      );
      const notes = cleanText(body.progressNotes, 4000);

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          'UPDATE performance_goals SET status = ?, progress_percentage = ?, completed_at = ? WHERE id = ?',
          [
            normalised.status,
            normalised.percentage,
            normalised.status === 'completed' ? goal.completed_at || new Date() : null,
            goal.id,
          ]
        );
        const updateId = await recordGoalUpdate(conn, {
          goalId: goal.id,
          userId: req.user.id,
          previousStatus: goal.status,
          newStatus: normalised.status,
          previousPercentage: goal.progress_percentage,
          newPercentage: normalised.percentage,
          notes: notes || 'Progress updated.',
        });
        if (files.length) await saveGoalAttachments(conn, { goalId: goal.id, updateId, files, userId: req.user.id });
        await logActivity(conn, {
          userId: req.user.id,
          goalId: goal.id,
          action:
            normalised.status === 'completed'
              ? 'goal_completed'
              : normalised.status === 'on_hold'
                ? 'goal_on_hold'
                : 'progress_updated',
          description: `Progress updated from ${num(goal.progress_percentage)}% to ${normalised.percentage}%${
            normalised.status !== goal.status ? ` (${STATUS_LABEL[normalised.status] || normalised.status})` : ''
          }.`,
          oldStatus: goal.status,
          newStatus: normalised.status,
        });
        await conn.commit();
      } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
      } finally {
        conn.release();
      }
      const updated = await loadGoal(req, req.params.id);
      res.json({ goal: updated });
    } catch (err) {
      removeUploadedFiles(files);
      throw err;
    }
  })
);

router.get(
  '/goals/:id/history',
  requireAnyPermission('performance.goals.view', 'performance.goals.manage', 'performance.goals.self'),
  asyncHandler(async (req, res) => {
    const goal = await loadGoal(req, req.params.id);
    if (!goal) throw new ApiError(404, 'Goal not found.');
    const [updates] = await pool.query(
      `SELECT gu.*, u.name AS updated_by_name
       FROM performance_goal_updates gu LEFT JOIN hrm_users u ON u.id = gu.updated_by
       WHERE gu.goal_id = ? ORDER BY gu.created_at DESC, gu.id DESC`,
      [goal.id]
    );
    const [attachments] = await pool.query(
      `SELECT a.id, a.goal_id, a.update_id, a.file_name, a.file_type, a.file_size, a.created_at, u.name AS uploaded_by_name
       FROM performance_goal_attachments a LEFT JOIN hrm_users u ON u.id = a.uploaded_by
       WHERE a.goal_id = ? ORDER BY a.created_at DESC`,
      [goal.id]
    );
    const [activities] = await pool.query(
      `SELECT a.*, u.name AS user_name FROM performance_activity_logs a
       LEFT JOIN hrm_users u ON u.id = a.user_id
       WHERE a.goal_id = ? ORDER BY a.created_at DESC, a.id DESC`,
      [goal.id]
    );
    res.json({ data: updates, attachments, activities });
  })
);

/* ------------------------------------------------------------------ */
/*  Goal attachments                                                   */
/* ------------------------------------------------------------------ */
router.post(
  '/goals/:id/attachments',
  requireAnyPermission('performance.goals.self', 'performance.goals.manage'),
  uploadGoalAttachments,
  asyncHandler(async (req, res) => {
    const files = req.files || [];
    try {
      if (!files.length) throw new ApiError(400, 'Please choose at least one attachment.');
      const goal = await loadGoal(req, req.params.id);
      if (!goal) throw new ApiError(404, 'Goal not found.');
      if (!canManageGoals(req) && goal.employee_id !== req.user.employeeId) {
        throw new ApiError(403, 'You can only attach files to your own goals.');
      }
      if (goal.status === 'cancelled') throw new ApiError(400, 'Cancelled goals cannot receive new attachments.');
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const ids = await saveGoalAttachments(conn, { goalId: goal.id, files, userId: req.user.id });
        await logActivity(conn, {
          userId: req.user.id,
          goalId: goal.id,
          action: 'attachment_added',
          description: `${ids.length} attachment(s) added.`,
        });
        await conn.commit();
      } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
      } finally {
        conn.release();
      }
      const [rows] = await pool.query(
        `SELECT a.id, a.file_name, a.file_type, a.file_size, a.created_at
         FROM performance_goal_attachments a WHERE a.goal_id = ? ORDER BY a.created_at DESC`,
        [goal.id]
      );
      res.status(201).json({ data: rows });
    } catch (err) {
      removeUploadedFiles(files);
      throw err;
    }
  })
);

router.get(
  '/goals/:id/attachments/:attachmentId',
  requireAnyPermission('performance.goals.view', 'performance.goals.manage', 'performance.goals.self'),
  asyncHandler(async (req, res) => {
    const goal = await loadGoal(req, req.params.id);
    if (!goal) throw new ApiError(404, 'Goal not found.');
    const [rows] = await pool.query(
      'SELECT * FROM performance_goal_attachments WHERE id = ? AND goal_id = ? LIMIT 1',
      [parsePositiveId(req.params.attachmentId, 'attachment'), goal.id]
    );
    const attachment = rows[0];
    if (!attachment) throw new ApiError(404, 'Attachment not found.');
    const full = attachmentPath(attachment.stored_name);
    const safeName = String(attachment.file_name || 'attachment').replace(/[\\/\r\n"]/g, '_');
    res.setHeader('Content-Type', attachment.file_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.sendFile(full);
  })
);

router.delete(
  '/goals/:id/attachments/:attachmentId',
  requireAnyPermission('performance.goals.self', 'performance.goals.manage'),
  asyncHandler(async (req, res) => {
    const goal = await loadGoal(req, req.params.id);
    if (!goal) throw new ApiError(404, 'Goal not found.');
    if (!canManageGoals(req) && goal.employee_id !== req.user.employeeId) {
      throw new ApiError(403, 'You can only remove attachments from your own goals.');
    }
    const [rows] = await pool.query(
      'SELECT * FROM performance_goal_attachments WHERE id = ? AND goal_id = ? LIMIT 1',
      [parsePositiveId(req.params.attachmentId, 'attachment'), goal.id]
    );
    const attachment = rows[0];
    if (!attachment) throw new ApiError(404, 'Attachment not found.');
    await pool.query('DELETE FROM performance_goal_attachments WHERE id = ?', [attachment.id]);
    removeAttachment(attachment.stored_name);
    await audit(req, { action: 'performance.goal.attachment.delete', entity: 'performance_goal', entityId: goal.id });
    res.json({ deleted: true });
  })
);

/* ------------------------------------------------------------------ */
/*  Review cycles                                                      */
/* ------------------------------------------------------------------ */
function cycleScopeSql(req) {
  if (canViewAllCycles(req)) return { sql: '', params: [] };
  return {
    sql: 'EXISTS (SELECT 1 FROM performance_review_cycle_employees ce WHERE ce.cycle_id = c.id AND ce.employee_id = ?)',
    params: [req.user.employeeId || 0],
  };
}

router.get(
  '/review-cycles',
  requireAnyPermission('performance.reviews.view', 'performance.reviews.manage'),
  asyncHandler(async (req, res) => {
    const where = [];
    const params = [];
    const scope = cycleScopeSql(req);
    if (scope.sql) {
      where.push(scope.sql);
      params.push(...scope.params);
    }
    if (req.query.status) {
      const status = String(req.query.status);
      if (CYCLE_STATUSES.includes(status)) {
        where.push('c.status = ?');
        params.push(status);
      }
    }
    if (req.query.period) {
      const period = String(req.query.period);
      if (PERIODS.includes(period)) {
        where.push('c.review_period = ?');
        params.push(period);
      }
    }
    if (req.query.departmentId) {
      where.push('c.department_id = ?');
      params.push(Number(req.query.departmentId));
    }
    if (req.query.from) {
      where.push('c.start_date >= ?');
      params.push(String(req.query.from).slice(0, 10));
    }
    if (req.query.to) {
      where.push('c.end_date <= ?');
      params.push(String(req.query.to).slice(0, 10));
    }
    const search = String(req.query.search || '').trim();
    if (search) {
      where.push('(c.cycle_name LIKE ? OR c.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const page = Math.max(1, Number(req.query.page) || 1);
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM performance_review_cycles c ${clause}`,
      params
    );
    const [rows] = await pool.query(
      `${CYCLE_SELECT} ${clause} ORDER BY c.start_date DESC, c.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );
    const [[stats]] = await pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(c.status = 'draft'),0) AS draft,
              COALESCE(SUM(c.status = 'scheduled'),0) AS scheduled,
              COALESCE(SUM(c.status = 'active'),0) AS active,
              COALESCE(SUM(c.status = 'completed'),0) AS completed,
              COALESCE(SUM(c.status = 'cancelled'),0) AS cancelled
       FROM performance_review_cycles c ${scope.sql ? `WHERE ${scope.sql}` : ''}`,
      scope.params
    );
    res.json({
      data: rows,
      page,
      pages: Math.ceil(num(countRow.total) / limit) || 0,
      total: num(countRow.total),
      stats: {
        total: num(stats.total),
        draft: num(stats.draft),
        scheduled: num(stats.scheduled),
        active: num(stats.active),
        completed: num(stats.completed),
        cancelled: num(stats.cancelled),
      },
    });
  })
);

router.get(
  '/review-cycles/:id',
  requireAnyPermission('performance.reviews.view', 'performance.reviews.manage'),
  asyncHandler(async (req, res) => {
    const cycle = await loadCycle(req, req.params.id);
    if (!cycle) throw new ApiError(404, 'Review cycle not found.');
    const employeeScope = canViewAllCycles(req) ? '' : 'AND ce.employee_id = ?';
    const employeeParams = [cycle.start_date, cycle.end_date, cycle.start_date, cycle.end_date, cycle.start_date, cycle.end_date, cycle.start_date, cycle.end_date, cycle.id];
    if (!canViewAllCycles(req)) employeeParams.push(req.user.employeeId || 0);
    const [employees] = await pool.query(
      `SELECT e.id, e.employee_code, e.first_name, e.last_name, e.designation, e.avatar_color,
              d.name AS department_name,
              (SELECT COUNT(*) FROM performance_goals g WHERE g.employee_id = e.id AND g.target_date BETWEEN ? AND ?) AS total_goals,
              (SELECT COUNT(*) FROM performance_goals g WHERE g.employee_id = e.id AND g.target_date BETWEEN ? AND ? AND g.status = 'completed') AS completed_goals,
              (SELECT COUNT(*) FROM performance_goals g WHERE g.employee_id = e.id AND g.target_date BETWEEN ? AND ?
                 AND g.status NOT IN ('completed','cancelled')) AS pending_goals,
              (SELECT COUNT(*) FROM performance_goals g WHERE g.employee_id = e.id AND g.target_date BETWEEN ? AND ?
                 AND g.status NOT IN ('completed','cancelled') AND g.target_date < CURDATE()) AS overdue_goals
       FROM performance_review_cycle_employees ce
       JOIN hrm_employees e ON e.id = ce.employee_id
       LEFT JOIN hrm_departments d ON d.id = e.department_id
       WHERE ce.cycle_id = ? ${employeeScope} ORDER BY e.first_name, e.last_name`,
      employeeParams
    );

    const goalWhere = ['g.target_date BETWEEN ? AND ?'];
    const goalParams = [cycle.start_date, cycle.end_date];
    if (!canViewAllCycles(req)) {
      goalWhere.push('g.employee_id = ?');
      goalParams.push(req.user.employeeId || 0);
    } else {
      goalWhere.push('g.employee_id IN (SELECT employee_id FROM performance_review_cycle_employees WHERE cycle_id = ?)');
      goalParams.push(cycle.id);
    }
    const [goals] = await pool.query(
      `${GOAL_SELECT} WHERE ${goalWhere.join(' AND ')} ORDER BY g.target_date ASC, g.id DESC`,
      goalParams
    );

    const [activities] = await pool.query(
      `SELECT a.*, u.name AS user_name FROM performance_activity_logs a
       LEFT JOIN hrm_users u ON u.id = a.user_id
       WHERE a.cycle_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 50`,
      [cycle.id]
    );
    res.json({ cycle, employees, goals, activities });
  })
);

router.post(
  '/review-cycles',
  requirePermission('performance.reviews.manage'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const cycleName = cleanText(body.cycleName, 160);
    if (!cycleName) throw new ApiError(400, 'Review cycle name is required.');
    const reviewPeriod = String(body.reviewPeriod || 'quarterly');
    if (!PERIODS.includes(reviewPeriod)) throw new ApiError(400, 'Please choose a valid review period.');
    const startDate = parseDate(body.startDate, 'start date');
    const endDate = parseDate(body.endDate, 'end date');
    if (endDate < startDate) throw new ApiError(400, 'End date cannot be earlier than the start date.');
    const status = String(body.status || 'draft');
    if (!['draft', 'scheduled', 'active'].includes(status)) throw new ApiError(400, 'Please choose a valid review cycle status.');
    const description = cleanText(body.description, 8000);
    const rawEmployees = Array.isArray(body.employeeIds) ? body.employeeIds : [];
    if (!rawEmployees.length) throw new ApiError(400, 'Please assign at least one employee to the review cycle.');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const employees = await assertEmployeeIds(conn, rawEmployees);
      const department = body.departmentId ? await assertDepartment(conn, body.departmentId) : null;
      const [result] = await conn.query(
        `INSERT INTO performance_review_cycles
           (cycle_name, description, review_period, start_date, end_date, department_id, status, created_by, activated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          cycleName,
          description,
          reviewPeriod,
          startDate,
          endDate,
          department ? department.id : null,
          status,
          req.user.id,
          status === 'active' ? new Date() : null,
        ]
      );
      const cycleId = result.insertId;
      for (const employee of employees) {
        await conn.query(
          'INSERT IGNORE INTO performance_review_cycle_employees (cycle_id, employee_id) VALUES (?,?)',
          [cycleId, employee.id]
        );
      }
      await logActivity(conn, {
        userId: req.user.id,
        cycleId,
        action: 'cycle_created',
        description: `Review cycle "${cycleName}" created for ${employees.length} employee(s).`,
        newStatus: status,
      });
      await conn.commit();
      const cycle = await loadCycle(req, cycleId);
      res.status(201).json({ cycle });
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  })
);

router.put(
  '/review-cycles/:id',
  requirePermission('performance.reviews.manage'),
  asyncHandler(async (req, res) => {
    const cycle = await loadCycle(req, req.params.id);
    if (!cycle) throw new ApiError(404, 'Review cycle not found.');
    if (['completed', 'cancelled'].includes(cycle.status)) {
      throw new ApiError(400, 'Completed and cancelled review cycles are preserved as historical records.');
    }
    const body = req.body || {};
    const cycleName = body.cycleName !== undefined ? cleanText(body.cycleName, 160) : cycle.cycle_name;
    if (!cycleName) throw new ApiError(400, 'Review cycle name is required.');
    const reviewPeriod = body.reviewPeriod !== undefined ? String(body.reviewPeriod) : cycle.review_period;
    if (!PERIODS.includes(reviewPeriod)) throw new ApiError(400, 'Please choose a valid review period.');
    const startDate = body.startDate !== undefined ? parseDate(body.startDate, 'start date') : String(cycle.start_date).slice(0, 10);
    const endDate = body.endDate !== undefined ? parseDate(body.endDate, 'end date') : String(cycle.end_date).slice(0, 10);
    if (endDate < startDate) throw new ApiError(400, 'End date cannot be earlier than the start date.');
    const description = body.description !== undefined ? cleanText(body.description, 8000) : cycle.description;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      let departmentId = cycle.department_id;
      if (body.departmentId !== undefined) {
        const department = body.departmentId ? await assertDepartment(conn, body.departmentId) : null;
        departmentId = department ? department.id : null;
      }
      await conn.query(
        `UPDATE performance_review_cycles
         SET cycle_name = ?, description = ?, review_period = ?, start_date = ?, end_date = ?, department_id = ?
         WHERE id = ?`,
        [cycleName, description, reviewPeriod, startDate, endDate, departmentId, cycle.id]
      );
      if (Array.isArray(body.employeeIds)) {
        const employees = await assertEmployeeIds(conn, body.employeeIds);
        await conn.query('DELETE FROM performance_review_cycle_employees WHERE cycle_id = ?', [cycle.id]);
        for (const employee of employees) {
          await conn.query(
            'INSERT IGNORE INTO performance_review_cycle_employees (cycle_id, employee_id) VALUES (?,?)',
            [cycle.id, employee.id]
          );
        }
      }
      await logActivity(conn, {
        userId: req.user.id,
        cycleId: cycle.id,
        action: 'cycle_updated',
        description: 'Review cycle details updated.',
      });
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
    const updated = await loadCycle(req, req.params.id);
    await audit(req, { action: 'performance.cycle.update', entity: 'performance_review_cycle', entityId: cycle.id });
    res.json({ cycle: updated });
  })
);

router.patch(
  '/review-cycles/:id/status',
  requirePermission('performance.reviews.manage'),
  asyncHandler(async (req, res) => {
    const cycle = await loadCycle(req, req.params.id);
    if (!cycle) throw new ApiError(404, 'Review cycle not found.');
    const status = String((req.body || {}).status || '');
    if (!CYCLE_STATUSES.includes(status)) throw new ApiError(400, 'Please choose a valid review cycle status.');
    if (!(CYCLE_TRANSITIONS[cycle.status] || []).includes(status)) {
      throw new ApiError(400, `A ${cycle.status} cycle cannot be changed to ${status}.`);
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE performance_review_cycles
         SET status = ?, activated_at = CASE WHEN ? = 'active' THEN COALESCE(activated_at, NOW()) ELSE activated_at END,
             completed_at = CASE WHEN ? = 'completed' THEN NOW() ELSE completed_at END,
             cancelled_at = CASE WHEN ? = 'cancelled' THEN NOW() ELSE cancelled_at END
         WHERE id = ?`,
        [status, status, status, status, cycle.id]
      );
      await logActivity(conn, {
        userId: req.user.id,
        cycleId: cycle.id,
        action:
          status === 'completed' ? 'cycle_completed' : status === 'active' ? 'cycle_started' : status === 'cancelled' ? 'cycle_cancelled' : 'cycle_updated',
        description: `Review cycle status changed from ${cycle.status} to ${status}.`,
        oldStatus: cycle.status,
        newStatus: status,
      });
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
    const updated = await loadCycle(req, req.params.id);
    await audit(req, { action: 'performance.cycle.status', entity: 'performance_review_cycle', entityId: cycle.id, details: { status } });
    res.json({ cycle: updated });
  })
);

/* ------------------------------------------------------------------ */
/*  Reports                                                            */
/* ------------------------------------------------------------------ */
function reportFilters(req) {
  const { clause, params } = goalFilters(req);
  return { clause, params };
}

function reportLabelFilters(query) {
  const parts = [];
  if (query.from || query.to) parts.push(`Dates ${query.from || 'any'} to ${query.to || 'today'}`);
  if (query.search) parts.push(`Search "${query.search}"`);
  return parts.join(' · ');
}

async function buildGoalReport(req) {
  const { clause, params } = reportFilters(req);
  const [[summary]] = await pool.query(
    `SELECT COUNT(*) AS total_goals,
            COALESCE(SUM(${EFFECTIVE_STATUS} = 'completed'),0) AS completed,
            COALESCE(SUM(${EFFECTIVE_STATUS} = 'in_progress'),0) AS in_progress,
            COALESCE(SUM(${EFFECTIVE_STATUS} IN ('not_started','on_hold')),0) AS pending,
            COALESCE(SUM(${EFFECTIVE_STATUS} = 'overdue'),0) AS overdue,
            COALESCE(SUM(${EFFECTIVE_STATUS} = 'cancelled'),0) AS cancelled
     FROM performance_goals g JOIN hrm_employees e ON e.id = g.employee_id ${clause}`,
    params
  );
  const [byPriority] = await pool.query(
    `SELECT g.priority, COUNT(*) AS count,
            COALESCE(SUM(g.status = 'completed'),0) AS completed
     FROM performance_goals g JOIN hrm_employees e ON e.id = g.employee_id ${clause}
     GROUP BY g.priority ORDER BY FIELD(g.priority,'critical','high','medium','low')`,
    params
  );
  const [byStatus] = await pool.query(
    `SELECT ${EFFECTIVE_STATUS} AS status, COUNT(*) AS count
     FROM performance_goals g JOIN hrm_employees e ON e.id = g.employee_id ${clause}
     GROUP BY ${EFFECTIVE_STATUS}`,
    params
  );
  const [byDepartment] = await pool.query(
    `SELECT COALESCE(d.name,'Unassigned') AS name, COUNT(*) AS total,
            COALESCE(SUM(${EFFECTIVE_STATUS} = 'completed'),0) AS completed,
            COALESCE(SUM(${EFFECTIVE_STATUS} = 'in_progress'),0) AS in_progress,
            COALESCE(SUM(${EFFECTIVE_STATUS} IN ('not_started','on_hold')),0) AS pending,
            COALESCE(SUM(${EFFECTIVE_STATUS} = 'overdue'),0) AS overdue
     FROM performance_goals g
     JOIN hrm_employees e ON e.id = g.employee_id
     LEFT JOIN hrm_departments d ON d.id = g.department_id
     ${clause} GROUP BY COALESCE(d.name,'Unassigned') ORDER BY total DESC, name ASC`,
    params
  );
  const [monthly] = await pool.query(
    `SELECT DATE_FORMAT(g.completed_at,'%Y-%m') AS month, COUNT(*) AS count
     FROM performance_goals g JOIN hrm_employees e ON e.id = g.employee_id
     ${clause ? `${clause} AND` : 'WHERE'} g.status = 'completed' AND g.completed_at IS NOT NULL
     GROUP BY DATE_FORMAT(g.completed_at,'%Y-%m') ORDER BY month`,
    params
  );
  const [rows] = await pool.query(
    `SELECT g.goal_code, CONCAT(e.first_name,' ',e.last_name) AS employee, e.employee_code,
            COALESCE(d.name,'') AS department, g.title, g.priority, ${EFFECTIVE_STATUS} AS status,
            g.start_date, g.target_date, g.progress_percentage
     FROM performance_goals g
     JOIN hrm_employees e ON e.id = g.employee_id
     LEFT JOIN hrm_departments d ON d.id = g.department_id
     ${clause} ORDER BY g.target_date ASC, g.id DESC LIMIT 5000`,
    params
  );
  return {
    summary: {
      totalGoals: num(summary.total_goals),
      completed: num(summary.completed),
      inProgress: num(summary.in_progress),
      pending: num(summary.pending),
      overdue: num(summary.overdue),
      cancelled: num(summary.cancelled),
    },
    byPriority,
    byStatus,
    byDepartment,
    monthly,
    rows,
  };
}

async function buildEmployeeReport(req) {
  const { clause, params } = reportFilters(req);
  const [rows] = await pool.query(
    `SELECT e.id, e.employee_code, CONCAT(e.first_name,' ',e.last_name) AS name,
            e.avatar_color, COALESCE(d.name,'Unassigned') AS department_name,
            COUNT(g.id) AS total_goals,
            COALESCE(SUM(${EFFECTIVE_STATUS} = 'completed'),0) AS completed,
            COALESCE(SUM(${EFFECTIVE_STATUS} = 'in_progress'),0) AS in_progress,
            COALESCE(SUM(${EFFECTIVE_STATUS} IN ('not_started','on_hold')),0) AS pending,
            COALESCE(SUM(${EFFECTIVE_STATUS} = 'overdue'),0) AS overdue
     FROM performance_goals g
     JOIN hrm_employees e ON e.id = g.employee_id
     LEFT JOIN hrm_departments d ON d.id = e.department_id
     ${clause}
     GROUP BY e.id, e.employee_code, e.first_name, e.last_name, e.avatar_color, d.name
     ORDER BY total_goals DESC, name ASC`,
    params
  );
  return { rows };
}

async function buildDepartmentReport(req) {
  const { clause, params } = reportFilters(req);
  const [rows] = await pool.query(
    `SELECT COALESCE(d.name,'Unassigned') AS name,
            COUNT(DISTINCT g.employee_id) AS total_employees,
            COUNT(g.id) AS total_goals,
            COALESCE(SUM(${EFFECTIVE_STATUS} = 'completed'),0) AS completed,
            COALESCE(SUM(${EFFECTIVE_STATUS} = 'in_progress'),0) AS in_progress,
            COALESCE(SUM(${EFFECTIVE_STATUS} IN ('not_started','on_hold')),0) AS pending,
            COALESCE(SUM(${EFFECTIVE_STATUS} = 'overdue'),0) AS overdue
     FROM performance_goals g
     JOIN hrm_employees e ON e.id = g.employee_id
     LEFT JOIN hrm_departments d ON d.id = g.department_id
     ${clause}
     GROUP BY COALESCE(d.name,'Unassigned') ORDER BY total_goals DESC, name ASC`,
    params
  );
  return { rows };
}

async function buildCycleReport(req) {
  const where = [];
  const params = [];
  const scope = cycleScopeSql(req);
  if (scope.sql) {
    where.push(scope.sql);
    params.push(...scope.params);
  }
  if (req.query.status && CYCLE_STATUSES.includes(String(req.query.status))) {
    where.push('c.status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.period && PERIODS.includes(String(req.query.period))) {
    where.push('c.review_period = ?');
    params.push(String(req.query.period));
  }
  if (req.query.departmentId) {
    where.push('c.department_id = ?');
    params.push(Number(req.query.departmentId));
  }
  if (req.query.employeeId) {
    where.push(
      'c.id IN (SELECT ce.cycle_id FROM performance_review_cycle_employees ce WHERE ce.employee_id = ?)'
    );
    params.push(Number(req.query.employeeId));
  }
  if (req.query.from) {
    where.push('c.start_date >= ?');
    params.push(String(req.query.from).slice(0, 10));
  }
  if (req.query.to) {
    where.push('c.end_date <= ?');
    params.push(String(req.query.to).slice(0, 10));
  }
  const search = String(req.query.search || '').trim();
  if (search) {
    where.push('c.cycle_name LIKE ?');
    params.push(`%${search}%`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[summary]] = await pool.query(
    `SELECT COUNT(*) AS total_cycles,
            COALESCE(SUM(c.status = 'active'),0) AS active,
            COALESCE(SUM(c.status = 'completed'),0) AS completed,
            COALESCE(SUM(c.status = 'cancelled'),0) AS cancelled,
            COALESCE(SUM(c.status = 'scheduled'),0) AS scheduled,
            COALESCE(SUM(c.status = 'draft'),0) AS draft
     FROM performance_review_cycles c ${clause}`,
    params
  );
  const [rows] = await pool.query(`${CYCLE_SELECT} ${clause} ORDER BY c.start_date DESC, c.id DESC`, params);
  return {
    summary: {
      totalCycles: num(summary.total_cycles),
      active: num(summary.active),
      completed: num(summary.completed),
      cancelled: num(summary.cancelled),
      scheduled: num(summary.scheduled),
      draft: num(summary.draft),
      goalsCovered: rows.reduce((sum, r) => sum + num(r.total_goals), 0),
      goalsCompleted: rows.reduce((sum, r) => sum + num(r.completed_goals), 0),
    },
    rows,
  };
}

router.get(
  '/reports/goals',
  requirePermission('performance.reports'),
  asyncHandler(async (req, res) => {
    const report = await buildGoalReport(req);
    res.json(report);
  })
);

router.get(
  '/reports/employees',
  requirePermission('performance.reports'),
  asyncHandler(async (req, res) => {
    const report = await buildEmployeeReport(req);
    res.json(report);
  })
);

router.get(
  '/reports/departments',
  requirePermission('performance.reports'),
  asyncHandler(async (req, res) => {
    const report = await buildDepartmentReport(req);
    res.json(report);
  })
);

router.get(
  '/reports/review-cycles',
  requirePermission('performance.reports'),
  asyncHandler(async (req, res) => {
    const report = await buildCycleReport(req);
    res.json(report);
  })
);

const csvCell = (value) => {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function sendCsv(res, type, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="aurora-performance-${type}-${isoDate()}.csv"`);
  if (!rows.length) return res.send('No records found for the selected filters.\n');
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(','), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(','))];
  return res.send(lines.join('\n'));
}

router.get(
  '/reports/export',
  requirePermission('performance.reports'),
  asyncHandler(async (req, res) => {
    const type = ['goals', 'employees', 'departments', 'review-cycles', 'summary'].includes(String(req.query.type))
      ? String(req.query.type)
      : 'goals';
    const format = String(req.query.format || 'csv').toLowerCase();
    if (!['csv', 'pdf'].includes(format)) throw new ApiError(400, 'Unsupported export format.');

    let rows = [];
    let title = 'Performance report';
    let subtitle = '';
    let summary = [];
    let sections = [];

    if (type === 'goals' || type === 'summary') {
      const report = await buildGoalReport(req);
      rows = report.rows;
      title = 'Goal performance report';
      subtitle = `${report.summary.totalGoals} goals · ${report.summary.completed} completed · ${report.summary.overdue} overdue`;
      summary = [
        { label: 'Total goals', value: report.summary.totalGoals },
        { label: 'Completed', value: report.summary.completed },
        { label: 'In progress', value: report.summary.inProgress },
        { label: 'Pending', value: report.summary.pending },
        { label: 'Overdue', value: report.summary.overdue },
      ];
      sections.push({
        title: 'Goals',
        columns: [
          { key: 'goal_code', header: 'Code', width: 70 },
          { key: 'employee', header: 'Employee', width: 110 },
          { key: 'department', header: 'Department', width: 95 },
          { key: 'title', header: 'Goal', width: 190 },
          { key: 'priority', header: 'Priority', width: 60 },
          { key: 'status', header: 'Status', width: 70 },
          { key: 'target_date', header: 'Target', width: 70 },
          { key: 'progress_percentage', header: 'Progress %', width: 55 },
        ],
        rows: rows.map((r) => ({ ...r, priority: String(r.priority || '').toUpperCase(), status: STATUS_LABEL[r.status] || r.status })),
      });
      if (type === 'summary') {
        sections.push({
          title: 'Department summary',
          columns: [
            { key: 'name', header: 'Department', width: 200 },
            { key: 'total', header: 'Goals', width: 70 },
            { key: 'completed', header: 'Completed', width: 80 },
            { key: 'in_progress', header: 'In progress', width: 80 },
            { key: 'pending', header: 'Pending', width: 70 },
            { key: 'overdue', header: 'Overdue', width: 70 },
          ],
          rows: report.byDepartment,
        });
      }
    } else if (type === 'employees') {
      const report = await buildEmployeeReport(req);
      rows = report.rows;
      title = 'Employee performance report';
      subtitle = `${rows.length} employees with assigned goals`;
      const totals = rows.reduce(
        (acc, r) => ({
          goals: acc.goals + num(r.total_goals),
          completed: acc.completed + num(r.completed),
          overdue: acc.overdue + num(r.overdue),
        }),
        { goals: 0, completed: 0, overdue: 0 }
      );
      summary = [
        { label: 'Employees', value: rows.length },
        { label: 'Goals assigned', value: totals.goals },
        { label: 'Completed', value: totals.completed },
        { label: 'Overdue', value: totals.overdue },
      ];
      sections.push({
        title: 'Employee-wise goals',
        columns: [
          { key: 'employee_code', header: 'Employee ID', width: 80 },
          { key: 'name', header: 'Employee', width: 150 },
          { key: 'department_name', header: 'Department', width: 120 },
          { key: 'total_goals', header: 'Assigned', width: 70 },
          { key: 'completed', header: 'Completed', width: 70 },
          { key: 'in_progress', header: 'In progress', width: 70 },
          { key: 'pending', header: 'Pending', width: 60 },
          { key: 'overdue', header: 'Overdue', width: 60 },
        ],
        rows,
      });
    } else if (type === 'departments') {
      const report = await buildDepartmentReport(req);
      rows = report.rows;
      title = 'Department performance report';
      subtitle = 'Goal distribution and completion by department';
      summary = [
        { label: 'Departments', value: rows.length },
        { label: 'Goals', value: rows.reduce((s, r) => s + num(r.total_goals), 0) },
        { label: 'Completed', value: rows.reduce((s, r) => s + num(r.completed), 0) },
        { label: 'Overdue', value: rows.reduce((s, r) => s + num(r.overdue), 0) },
      ];
      sections.push({
        title: 'Department-wise goals',
        columns: [
          { key: 'name', header: 'Department', width: 180 },
          { key: 'total_employees', header: 'Employees', width: 80 },
          { key: 'total_goals', header: 'Goals', width: 70 },
          { key: 'completed', header: 'Completed', width: 80 },
          { key: 'in_progress', header: 'In progress', width: 80 },
          { key: 'pending', header: 'Pending', width: 70 },
          { key: 'overdue', header: 'Overdue', width: 70 },
        ],
        rows,
      });
    } else {
      const report = await buildCycleReport(req);
      rows = report.rows;
      title = 'Review cycle report';
      subtitle = 'Review cycle coverage and goal completion';
      summary = [
        { label: 'Total cycles', value: report.summary.totalCycles },
        { label: 'Active', value: report.summary.active },
        { label: 'Completed', value: report.summary.completed },
        { label: 'Cancelled', value: report.summary.cancelled },
        { label: 'Goals covered', value: report.summary.goalsCovered },
      ];
      sections.push({
        title: 'Review cycles',
        columns: [
          { key: 'cycle_name', header: 'Cycle', width: 180 },
          { key: 'review_period', header: 'Period', width: 80 },
          { key: 'department_name', header: 'Department', width: 100 },
          { key: 'start_date', header: 'Start', width: 70 },
          { key: 'end_date', header: 'End', width: 70 },
          { key: 'employee_count', header: 'Employees', width: 65 },
          { key: 'total_goals', header: 'Goals', width: 50 },
          { key: 'completed_goals', header: 'Completed', width: 65 },
          { key: 'pending_goals', header: 'Pending', width: 60 },
          { key: 'status', header: 'Status', width: 60 },
        ],
        rows: rows.map((r) => ({
          ...r,
          review_period: String(r.review_period || '').replace(/_/g, ' '),
          status: String(r.status || '').replace(/\b\w/g, (c) => c.toUpperCase()),
        })),
      });
    }

    if (format === 'csv') return sendCsv(res, type, rows);

    const pdf = await generatePerformanceReportPdf({
      title,
      subtitle,
      summary,
      sections,
      generatedBy: req.user.name,
      filters: reportLabelFilters(req.query),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="aurora-performance-${type}-${isoDate()}.pdf"`);
    return res.send(pdf);
  })
);

export default router;

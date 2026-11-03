import { Router } from 'express';
import crypto from 'node:crypto';
import pool from '../db.js';
import { asyncHandler, ApiError, isoDate } from '../utils.js';
import { authenticate, requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { audit } from '../audit.js';
import { uploadReceipts, receiptPath, hashFile, removeReceipt, removeUploadedFiles } from '../expense-files.js';
import { generateExpenseStatementPdf } from '../services/expense-pdf.js';

const router = Router();
router.use(authenticate);

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'];
const PAYMENT_METHODS = ['bank_transfer', 'upi', 'cash', 'other'];
const PAYMENT_STATUSES = ['pending', 'processing', 'partially_paid', 'paid', 'failed', 'on_hold'];
const PENDING_APPROVAL = ['submitted', 'under_review', 'clarification_required'];
const REIMBURSABLE = ['approved', 'reimbursement_pending', 'partially_reimbursed'];

const CLAIM_SELECT = `
  SELECT x.*, e.first_name, e.last_name, e.employee_code, e.designation, e.avatar_color,
         e.email AS employee_email,
         d.name AS department_name, d.color AS department_color,
         c.name AS category_name, c.receipt_required, c.max_claim_amount,
         (SELECT COUNT(*) FROM expense_attachments a WHERE a.expense_id = x.id) AS attachment_count,
         (SELECT COALESCE(SUM(r.amount), 0) FROM expense_reimbursements r
           WHERE r.expense_id = x.id AND r.payment_status = 'paid') AS paid_amount,
         (SELECT COALESCE(SUM(r.amount), 0) FROM expense_reimbursements r
           WHERE r.expense_id = x.id AND r.payment_status IN ('pending','processing','partially_paid','paid')) AS committed_amount,
         CONCAT(e.first_name, ' ', e.last_name) AS employee_name
  FROM expense_claims x
  JOIN hrm_employees e ON e.id = x.employee_id
  LEFT JOIN hrm_departments d ON d.id = x.department_id
  JOIN expense_categories c ON c.id = x.category_id
`;

const CLAIM_ORDER = "FIELD(x.approval_status,'submitted','under_review','clarification_required','approved','reimbursement_pending','partially_reimbursed','reimbursed','draft','rejected','cancelled')";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const money = (n) => round2(Number(n) || 0);

function cleanText(value, max = 500) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

function validCurrency(value) {
  const c = String(value || '').toUpperCase();
  if (!CURRENCIES.includes(c)) throw new ApiError(400, 'Please choose a supported currency.');
  return c;
}

function parseAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new ApiError(400, 'Amount must be greater than zero.');
  if (n > 100000000) throw new ApiError(400, 'Amount is too large.');
  return money(n);
}

function parseDate(value, label = 'date') {
  const s = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ApiError(400, `Please enter a valid ${label}.`);
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, `Please enter a valid ${label}.`);
  return s;
}

function isFutureDate(s) {
  return String(s) > isoDate();
}

function resolveRange(query) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fmt = (d) => isoDate(d);
  switch (query.range) {
    case 'this_month':
      return { from: fmt(new Date(y, m, 1)), to: fmt(new Date(y, m + 1, 0)) };
    case 'last_month':
      return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) };
    case 'last_3_months':
      return { from: fmt(new Date(y, m - 2, 1)), to: fmt(new Date(y, m + 1, 0)) };
    case 'this_year':
      return { from: fmt(new Date(y, 0, 1)), to: fmt(new Date(y, 11, 31)) };
    case 'custom':
      return { from: query.from || null, to: query.to || null };
    default:
      return { from: query.from || null, to: query.to || null };
  }
}

async function getSettings() {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM expense_settings');
  return Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
}

async function loadCategory(id) {
  const [rows] = await pool.query('SELECT * FROM expense_categories WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function loadClaim(id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  const [rows] = await pool.query(`${CLAIM_SELECT} WHERE x.id = ? LIMIT 1`, [numericId]);
  return rows[0] || null;
}

function canViewClaim(req, claim) {
  return (
    claim.employee_id === req.user.employeeId ||
    req.permissions.includes('expenses.view_all') ||
    req.permissions.includes('expenses.approve') ||
    req.permissions.includes('expenses.reimburse')
  );
}

const EDITABLE = ['draft', 'clarification_required'];

function assertOwnerEditable(req, claim) {
  if (claim.employee_id !== req.user.employeeId)
    throw new ApiError(403, 'You can only modify your own expense claims.');
  if (!EDITABLE.includes(claim.approval_status))
    throw new ApiError(400, 'This claim can no longer be edited. Submit a new claim or contact an approver.');
}

async function logActivity(conn, { expenseId, userId, action, description, oldStatus, newStatus }) {
  await conn.query(
    `INSERT INTO expense_activity_logs (expense_id, user_id, action, description, old_status, new_status)
     VALUES (?,?,?,?,?,?)`,
    [expenseId, userId || null, action, description || null, oldStatus || null, newStatus || null]
  );
}

async function nextExpenseCode(conn, id) {
  const now = new Date();
  const code = `EXP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(id).padStart(5, '0')}`;
  await conn.query('UPDATE expense_claims SET expense_code = ? WHERE id = ?', [code, id]);
  return code;
}

async function recomputeReimbursementState(conn, expenseId) {
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount ELSE 0 END), 0) AS paid,
            COALESCE(SUM(CASE WHEN payment_status IN ('pending','processing','partially_paid','paid') THEN amount ELSE 0 END), 0) AS committed,
            COALESCE(SUM(CASE WHEN payment_status = 'processing' THEN 1 ELSE 0 END), 0) AS processing
     FROM expense_reimbursements WHERE expense_id = ?`,
    [expenseId]
  );
  const row = rows[0] || {};
  const [claimRows] = await conn.query(
    'SELECT amount, approved_amount FROM expense_claims WHERE id = ?',
    [expenseId]
  );
  const claim = claimRows[0];
  if (!claim) return;
  const approved = money(claim.approved_amount ?? claim.amount);
  const paid = money(row.paid);
  let approvalStatus = 'reimbursement_pending';
  let reimbursementStatus = 'pending';
  if (paid >= approved - 0.005 && approved > 0) {
    approvalStatus = 'reimbursed';
    reimbursementStatus = 'paid';
  } else if (paid > 0) {
    approvalStatus = 'partially_reimbursed';
    reimbursementStatus = 'partially_paid';
  } else if (Number(row.processing)) {
    approvalStatus = 'reimbursement_pending';
    reimbursementStatus = 'processing';
  } else if (Number(row.committed) > 0) {
    approvalStatus = 'reimbursement_pending';
    reimbursementStatus = 'pending';
  }
  await conn.query(
    'UPDATE expense_claims SET approval_status = ?, reimbursement_status = ? WHERE id = ?',
    [approvalStatus, reimbursementStatus, expenseId]
  );
}

async function checkReceiptAndPolicy({ categoryId, amount, attachmentCount, settings, isDraft }) {
  const category = await loadCategory(categoryId);
  if (!category) throw new ApiError(400, 'Please choose a valid expense category.');
  if (!Number(category.is_active)) throw new ApiError(400, 'That expense category is no longer active.');
  if (category.max_claim_amount != null && amount > Number(category.max_claim_amount))
    throw new ApiError(400, `The maximum claim for ${category.name} is ${Number(category.max_claim_amount).toLocaleString()}.`);
  if (!isDraft) {
    const threshold = money(settings.receipt_threshold_amount || 0);
    const required = Number(category.receipt_required) === 1 || (threshold > 0 && amount >= threshold);
    if (required && attachmentCount < 1)
      throw new ApiError(400, `A receipt is required for ${category.name} claims${threshold > 0 ? ` of ${threshold.toLocaleString()} or more` : ''}.`);
  }
  return category;
}

async function saveUploadedAttachments(conn, expenseId, files, userId) {
  const saved = [];
  for (const file of files || []) {
    let fileHash = null;
    try {
      fileHash = hashFile(file.path);
    } catch {
      fileHash = null;
    }
    const [result] = await conn.query(
      `INSERT INTO expense_attachments (expense_id, file_name, stored_name, file_type, file_size, file_hash, uploaded_by)
       VALUES (?,?,?,?,?,?,?)`,
      [expenseId, file.originalname.slice(0, 250), file.filename, file.mimetype, file.size, fileHash, userId || null]
    );
    saved.push(result.insertId);
  }
  return saved;
}

async function assertNoDuplicate(conn, { employeeId, amount, expenseDate, categoryId, files, excludeId }) {
  const [same] = await conn.query(
    `SELECT id, expense_code FROM expense_claims
     WHERE employee_id = ? AND amount = ? AND expense_date = ? AND category_id = ?
       AND approval_status NOT IN ('rejected','cancelled') ${excludeId ? 'AND id <> ?' : ''}
     LIMIT 1`,
    excludeId ? [employeeId, amount, expenseDate, categoryId, excludeId] : [employeeId, amount, expenseDate, categoryId]
  );
  if (same.length)
    throw new ApiError(409, `A matching claim already exists (${same[0].expense_code}). Duplicate claims are not allowed.`);

  const hashes = [];
  for (const file of files || []) {
    try {
      hashes.push(hashFile(file.path));
    } catch {
      /* ignore unreadable file */
    }
  }
  if (hashes.length) {
    const placeholders = hashes.map(() => '?').join(',');
    const [dupes] = await conn.query(
      `SELECT x.id, x.expense_code FROM expense_attachments a
       JOIN expense_claims x ON x.id = a.expense_id
       WHERE a.file_hash IN (${placeholders}) AND a.expense_id <> ?
         AND x.approval_status NOT IN ('rejected','cancelled')
       LIMIT 1`,
      [...hashes, excludeId || 0]
    );
    if (dupes.length)
      throw new ApiError(409, `This receipt is already attached to claim ${dupes[0].expense_code}.`);
  }
}

/* ------------------------------------------------------------------ */
/*  Categories                                                         */
/* ------------------------------------------------------------------ */
router.get(
  '/categories',
  requireAnyPermission('expenses.self', 'expenses.view_all', 'expenses.approve', 'expenses.reimburse', 'expenses.categories.manage'),
  asyncHandler(async (req, res) => {
    const includeInactive = req.permissions.includes('expenses.categories.manage') && req.query.all === '1';
    const [rows] = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM expense_claims x WHERE x.category_id = c.id) AS claim_count
       FROM expense_categories c
       ${includeInactive ? '' : 'WHERE c.is_active = 1'}
       ORDER BY c.name`
    );
    res.json({ data: rows, settings: await getSettings(), currencies: CURRENCIES });
  })
);

router.post(
  '/categories',
  requirePermission('expenses.categories.manage'),
  asyncHandler(async (req, res) => {
    const name = cleanText(req.body?.name, 100);
    if (!name) throw new ApiError(400, 'Category name is required.');
    const description = cleanText(req.body?.description, 400);
    const receiptRequired = req.body?.receiptRequired ? 1 : 0;
    const requiresApproval = req.body?.requiresApproval === false ? 0 : 1;
    let max = req.body?.maxClaimAmount;
    max = max === '' || max == null ? null : Number(max);
    if (max != null && (!Number.isFinite(max) || max < 0)) throw new ApiError(400, 'Maximum claim amount must be zero or greater.');

    const [exists] = await pool.query('SELECT id FROM expense_categories WHERE name = ? LIMIT 1', [name]);
    if (exists.length) throw new ApiError(409, 'A category with that name already exists.');

    const [result] = await pool.query(
      `INSERT INTO expense_categories (name, description, receipt_required, requires_approval, max_claim_amount, is_active, created_by)
       VALUES (?,?,?,?,?,1,?)`,
      [name, description, receiptRequired, requiresApproval, max, req.user.id]
    );
    await audit(req, { action: 'expense.category.create', entity: 'expense_category', entityId: result.insertId, details: { name } });
    const category = await loadCategory(result.insertId);
    res.status(201).json({ category, message: 'Expense category created.' });
  })
);

router.put(
  '/categories/:id',
  requirePermission('expenses.categories.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await loadCategory(id);
    if (!existing) throw new ApiError(404, 'Expense category not found.');
    const name = cleanText(req.body?.name, 100);
    if (!name) throw new ApiError(400, 'Category name is required.');
    const description = cleanText(req.body?.description, 400);
    const receiptRequired = req.body?.receiptRequired ? 1 : 0;
    const requiresApproval = req.body?.requiresApproval === false ? 0 : 1;
    let max = req.body?.maxClaimAmount;
    max = max === '' || max == null ? null : Number(max);
    if (max != null && (!Number.isFinite(max) || max < 0)) throw new ApiError(400, 'Maximum claim amount must be zero or greater.');

    const [dupe] = await pool.query('SELECT id FROM expense_categories WHERE name = ? AND id <> ? LIMIT 1', [name, id]);
    if (dupe.length) throw new ApiError(409, 'A category with that name already exists.');

    await pool.query(
      `UPDATE expense_categories SET name = ?, description = ?, receipt_required = ?, requires_approval = ?, max_claim_amount = ? WHERE id = ?`,
      [name, description, receiptRequired, requiresApproval, max, id]
    );
    await audit(req, { action: 'expense.category.update', entity: 'expense_category', entityId: id, details: { name } });
    res.json({ category: await loadCategory(id), message: 'Expense category updated.' });
  })
);

router.patch(
  '/categories/:id/status',
  requirePermission('expenses.categories.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await loadCategory(id);
    if (!existing) throw new ApiError(404, 'Expense category not found.');
    const isActive = req.body?.isActive ? 1 : 0;
    await pool.query('UPDATE expense_categories SET is_active = ? WHERE id = ?', [isActive, id]);
    await audit(req, {
      action: 'expense.category.status',
      entity: 'expense_category',
      entityId: id,
      details: { name: existing.name, isActive },
    });
    res.json({ category: await loadCategory(id), message: `Category ${isActive ? 'activated' : 'deactivated'}.` });
  })
);

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */
router.get(
  '/settings',
  requirePermission('expenses.settings'),
  asyncHandler(async (req, res) => {
    res.json({ settings: await getSettings() });
  })
);

router.put(
  '/settings',
  requirePermission('expenses.settings'),
  asyncHandler(async (req, res) => {
    const allowed = [
      'default_currency',
      'receipt_threshold_amount',
      'max_attachment_mb',
      'max_attachments_per_expense',
      'reimbursement_reminder_days',
      'allow_draft_claims',
      'require_manager_approval',
      'statement_footer',
    ];
    const updates = req.body?.settings ?? req.body ?? {};
    if (!updates || typeof updates !== 'object' || Array.isArray(updates))
      throw new ApiError(400, 'Expense settings must be an object.');

    const validated = [];
    for (const [key, rawValue] of Object.entries(updates)) {
      if (!allowed.includes(key)) continue;
      let value = rawValue;
      if (key === 'default_currency') value = validCurrency(value);
      if (key === 'receipt_threshold_amount') {
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount < 0)
          throw new ApiError(400, 'Receipt threshold must be zero or greater.');
        value = String(amount);
      }
      if (key === 'max_attachment_mb') {
        const size = Number(value);
        if (!Number.isFinite(size) || size < 1 || size > 10)
          throw new ApiError(400, 'Attachment size must be between 1 and 10 MB.');
        value = String(size);
      }
      if (key === 'max_attachments_per_expense') {
        const count = Number(value);
        if (!Number.isInteger(count) || count < 1 || count > 5)
          throw new ApiError(400, 'Attachments per claim must be between 1 and 5.');
        value = String(count);
      }
      if (key === 'reimbursement_reminder_days') {
        const days = Number(value);
        if (!Number.isSafeInteger(days) || days < 1)
          throw new ApiError(400, 'Reimbursement reminder must be at least one day.');
        value = String(days);
      }
      if (key === 'allow_draft_claims' || key === 'require_manager_approval') {
        value = String(value);
        if (value !== '0' && value !== '1')
          throw new ApiError(400, 'Expense policy toggles must be enabled or disabled.');
      }
      if (key === 'statement_footer') {
        if (typeof value !== 'string' || value.length > 240)
          throw new ApiError(400, 'Statement footer must be 240 characters or fewer.');
      }
      validated.push([key, String(value)]);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const [key, value] of validated) {
        await conn.query(
          `INSERT INTO expense_settings (setting_key, setting_value, updated_by) VALUES (?,?,?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
          [key, value, req.user.id]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await audit(req, { action: 'expense.settings.update', entity: 'expense_settings', details: { keys: validated.map(([key]) => key) } });
    res.json({ settings: await getSettings(), message: 'Expense policy updated.' });
  })
);

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */
router.get(
  '/dashboard',
  requireAnyPermission('expenses.dashboard', 'expenses.self', 'expenses.view_all'),
  asyncHandler(async (req, res) => {
    const { from, to } = resolveRange(req.query);
    const canViewAll = req.permissions.includes('expenses.view_all');
    const where = [];
    const params = [];
    if (!canViewAll) {
      where.push('x.employee_id = ?');
      params.push(req.user.employeeId || 0);
    }
    if (from) {
      where.push('x.expense_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('x.expense_date <= ?');
      params.push(to);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[stats]] = await pool.query(
      `SELECT
         COUNT(*) AS total_claims,
         COALESCE(SUM(x.amount), 0) AS total_claimed,
         COALESCE(SUM(CASE WHEN x.approval_status IN ('submitted','under_review','clarification_required') THEN 1 ELSE 0 END), 0) AS pending,
         COALESCE(SUM(CASE WHEN x.approval_status IN ('approved','reimbursement_pending','partially_reimbursed','reimbursed') THEN 1 ELSE 0 END), 0) AS approved,
         COALESCE(SUM(CASE WHEN x.approval_status = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected,
         COALESCE(SUM(CASE WHEN x.approval_status IN ('submitted','under_review','clarification_required') THEN x.amount ELSE 0 END), 0) AS pending_amount,
         COALESCE(SUM(CASE WHEN x.approval_status IN ('approved','reimbursement_pending','partially_reimbursed','reimbursed') THEN x.approved_amount ELSE 0 END), 0) AS approved_amount
       FROM expense_claims x ${clause}`,
      params
    );

    const [[reimb]] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN r.payment_status IN ('pending','processing','partially_paid') THEN r.amount ELSE 0 END), 0) AS pending_amount,
         COALESCE(SUM(CASE WHEN r.payment_status IN ('pending','processing') THEN 1 ELSE 0 END), 0) AS pending_count,
         COALESCE(SUM(CASE WHEN r.payment_status = 'paid' THEN r.amount ELSE 0 END), 0) AS paid_amount,
         COALESCE(SUM(CASE WHEN r.payment_status = 'paid' THEN 1 ELSE 0 END), 0) AS paid_count
       FROM expense_reimbursements r
       JOIN expense_claims x ON x.id = r.expense_id ${clause}`,
      params
    );

    const [monthly] = await pool.query(
      `SELECT DATE_FORMAT(x.expense_date, '%Y-%m') AS month, COALESCE(SUM(x.amount), 0) AS amount, COUNT(*) AS count
       FROM expense_claims x ${clause}
       GROUP BY DATE_FORMAT(x.expense_date, '%Y-%m') ORDER BY month`,
      params
    );

    const [byCategory] = await pool.query(
      `SELECT c.id, c.name, COALESCE(SUM(x.amount), 0) AS amount, COUNT(*) AS count
       FROM expense_claims x JOIN expense_categories c ON c.id = x.category_id ${clause}
       GROUP BY c.id, c.name ORDER BY amount DESC`,
      params
    );

    const [byDepartment] = await pool.query(
      `SELECT COALESCE(d.name, 'Unassigned') AS name, COALESCE(SUM(x.amount), 0) AS amount, COUNT(*) AS count
       FROM expense_claims x
       LEFT JOIN hrm_departments d ON d.id = x.department_id ${clause}
       GROUP BY COALESCE(d.name, 'Unassigned') ORDER BY amount DESC`,
      params
    );

    const [statusBreakdown] = await pool.query(
      `SELECT x.approval_status AS status, COUNT(*) AS count, COALESCE(SUM(x.amount), 0) AS amount
       FROM expense_claims x ${clause} GROUP BY x.approval_status`,
      params
    );

    const recentWhere = clause ? `${clause} AND` : 'WHERE';
    const [recentClaims] = await pool.query(
      `${CLAIM_SELECT} ${recentWhere} x.approval_status <> 'draft'
       ORDER BY x.created_at DESC LIMIT 6`,
      params
    );

    const reimbWhere = clause ? `${clause} AND` : 'WHERE';
    const [recentReimbursements] = await pool.query(
      `SELECT r.*, x.expense_code, x.title, x.currency, CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              e.avatar_color
       FROM expense_reimbursements r
       JOIN expense_claims x ON x.id = r.expense_id
       JOIN hrm_employees e ON e.id = x.employee_id
       ${reimbWhere} r.payment_status <> 'failed'
       ORDER BY r.created_at DESC LIMIT 6`,
      params
    );

    res.json({
      scope: canViewAll ? 'organisation' : 'personal',
      range: { from, to },
      stats: {
        totalClaims: Number(stats.total_claims),
        totalClaimed: money(stats.total_claimed),
        pending: Number(stats.pending),
        approved: Number(stats.approved),
        rejected: Number(stats.rejected),
        pendingAmount: money(stats.pending_amount),
        approvedAmount: money(stats.approved_amount),
        reimbursementsPending: Number(reimb.pending_count),
        reimbursementsPendingAmount: money(reimb.pending_amount),
        totalReimbursed: money(reimb.paid_amount),
        reimbursementsPaid: Number(reimb.paid_count),
      },
      monthly,
      byCategory,
      byDepartment,
      statusBreakdown,
      recentClaims,
      recentReimbursements,
    });
  })
);

/* ------------------------------------------------------------------ */
/*  My expenses / claims list                                          */
/* ------------------------------------------------------------------ */
router.get(
  '/my',
  requirePermission('expenses.self'),
  asyncHandler(async (req, res) => {
    const employeeId = req.user.employeeId;
    if (!employeeId) return res.json({ data: [], total: 0, page: 1, pages: 0, stats: {} });
    const params = [employeeId];
    const where = ['x.employee_id = ?'];
    const { status, categoryId, search } = req.query;
    if (status) {
      where.push('x.approval_status = ?');
      params.push(status);
    }
    if (categoryId) {
      where.push('x.category_id = ?');
      params.push(Number(categoryId));
    }
    if (search) {
      where.push('(x.title LIKE ? OR x.expense_code LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const clause = `WHERE ${where.join(' AND ')}`;

    const [[stats]] = await pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN approval_status IN ('submitted','under_review','clarification_required') THEN 1 ELSE 0 END),0) AS pending,
              COALESCE(SUM(CASE WHEN approval_status IN ('approved','reimbursement_pending','partially_reimbursed','reimbursed') THEN 1 ELSE 0 END),0) AS approved,
              COALESCE(SUM(CASE WHEN approval_status = 'rejected' THEN 1 ELSE 0 END),0) AS rejected,
              COALESCE(SUM(CASE WHEN approval_status IN ('approved','reimbursement_pending','partially_reimbursed','reimbursed') THEN approved_amount ELSE 0 END),0) AS approved_amount,
              COALESCE(SUM(CASE WHEN approval_status = 'reimbursed' THEN approved_amount ELSE 0 END),0) AS reimbursed_amount
       FROM expense_claims WHERE employee_id = ?`,
      [employeeId]
    );

    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const page = Math.max(1, Number(req.query.page) || 1);
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM expense_claims x ${clause}`,
      params
    );
    const [rows] = await pool.query(
      `${CLAIM_SELECT} ${clause} ORDER BY x.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );
    res.json({
      data: rows,
      page,
      pages: Math.ceil(Number(countRow.total) / limit) || 0,
      total: Number(countRow.total),
      stats: {
        total: Number(stats.total),
        pending: Number(stats.pending),
        approved: Number(stats.approved),
        rejected: Number(stats.rejected),
        approvedAmount: money(stats.approved_amount),
        reimbursedAmount: money(stats.reimbursed_amount),
      },
    });
  })
);

router.get(
  '/',
  requirePermission('expenses.view_all'),
  asyncHandler(async (req, res) => {
    const {
      status = '',
      reimbursementStatus = '',
      categoryId = '',
      departmentId = '',
      employeeId = '',
      search = '',
      from = '',
      to = '',
      sort = 'created_at',
      dir = 'desc',
    } = req.query;
    const where = [];
    const params = [];
    if (status) {
      where.push('x.approval_status = ?');
      params.push(status);
    }
    if (reimbursementStatus) {
      where.push('x.reimbursement_status = ?');
      params.push(reimbursementStatus);
    }
    if (categoryId) {
      where.push('x.category_id = ?');
      params.push(Number(categoryId));
    }
    if (departmentId) {
      where.push('x.department_id = ?');
      params.push(Number(departmentId));
    }
    if (employeeId) {
      where.push('x.employee_id = ?');
      params.push(Number(employeeId));
    }
    if (search) {
      where.push('(x.title LIKE ? OR x.expense_code LIKE ? OR CONCAT(e.first_name, " ", e.last_name) LIKE ? OR e.employee_code LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (from) {
      where.push('x.expense_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('x.expense_date <= ?');
      params.push(to);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const sortable = {
      expense_code: 'x.expense_code',
      employee: 'employee_name',
      department: 'd.name',
      category: 'c.name',
      expense_date: 'x.expense_date',
      submitted_at: 'x.submitted_at',
      amount: 'x.amount',
      approval_status: 'x.approval_status',
      reimbursement_status: 'x.reimbursement_status',
      created_at: 'x.created_at',
    };
    const orderBy = sortable[sort] || sortable.created_at;
    const direction = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const page = Math.max(1, Number(req.query.page) || 1);
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM expense_claims x
       JOIN hrm_employees e ON e.id = x.employee_id
       LEFT JOIN hrm_departments d ON d.id = x.department_id
       JOIN expense_categories c ON c.id = x.category_id ${clause}`,
      params
    );
    const [rows] = await pool.query(
      `${CLAIM_SELECT} ${clause} ORDER BY ${orderBy} ${direction} LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );
    res.json({
      data: rows,
      total: Number(countRow.total),
      page,
      pages: Math.ceil(Number(countRow.total) / limit) || 0,
      limit,
    });
  })
);

/* ------------------------------------------------------------------ */
/*  Approver queue                                                     */
/* ------------------------------------------------------------------ */
router.get(
  '/approvals/pending',
  requirePermission('expenses.approve'),
  asyncHandler(async (req, res) => {
    const params = [];
    let clause = '';
    if (req.query.mine !== '1') {
      clause = 'AND x.employee_id <> ?';
      params.push(req.user.employeeId || 0);
    }
    const [rows] = await pool.query(
      `${CLAIM_SELECT}
       WHERE x.approval_status IN ('submitted','under_review','clarification_required') ${clause}
       ORDER BY FIELD(x.approval_status,'submitted','under_review','clarification_required'), x.submitted_at ASC, x.created_at ASC`,
      params
    );
    res.json({ data: rows, total: rows.length });
  })
);

/* ------------------------------------------------------------------ */
/*  Reimbursements (list must precede /:id)                            */
/* ------------------------------------------------------------------ */
router.get(
  '/reimbursements/pending',
  requirePermission('expenses.reimburse'),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `${CLAIM_SELECT}
       WHERE x.approval_status IN ('approved','reimbursement_pending','partially_reimbursed')
         AND COALESCE(x.approved_amount, x.amount) > COALESCE((
           SELECT SUM(r.amount) FROM expense_reimbursements r
           WHERE r.expense_id = x.id AND r.payment_status IN ('pending','processing','partially_paid','paid')
         ), 0)
       ORDER BY x.approved_at ASC, x.created_at ASC`
    );
    const enriched = rows.map((row) => ({
      ...row,
      outstanding_amount: money(money(row.approved_amount ?? row.amount) - money(row.committed_amount)),
    }));
    res.json({ data: enriched, total: enriched.length });
  })
);

router.get(
  '/reimbursements',
  requirePermission('expenses.reimburse'),
  asyncHandler(async (req, res) => {
    const { status = '', search = '', from = '', to = '' } = req.query;
    const where = [];
    const params = [];
    if (status) {
      where.push('r.payment_status = ?');
      params.push(status);
    }
    if (search) {
      where.push('(x.expense_code LIKE ? OR x.title LIKE ? OR CONCAT(e.first_name, " ", e.last_name) LIKE ? OR r.transaction_reference LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (from) {
      where.push('COALESCE(r.payment_date, DATE(r.created_at)) >= ?');
      params.push(from);
    }
    if (to) {
      where.push('COALESCE(r.payment_date, DATE(r.created_at)) <= ?');
      params.push(to);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT r.*, x.expense_code, x.title, x.currency, x.approved_amount, x.amount AS claim_amount,
              x.approval_status, x.reimbursement_status,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name, e.employee_code, e.avatar_color,
              u.name AS processed_by_name, d.name AS department_name
       FROM expense_reimbursements r
       JOIN expense_claims x ON x.id = r.expense_id
       JOIN hrm_employees e ON e.id = x.employee_id
       LEFT JOIN hrm_departments d ON d.id = x.department_id
       LEFT JOIN hrm_users u ON u.id = r.processed_by
       ${clause}
       ORDER BY r.created_at DESC`,
      params
    );
    res.json({ data: rows, total: rows.length });
  })
);

router.patch(
  '/reimbursements/:id/status',
  requirePermission('expenses.reimburse'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const status = String(req.body?.paymentStatus || req.body?.status || '');
    if (!PAYMENT_STATUSES.includes(status)) throw new ApiError(400, 'Invalid reimbursement status.');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        `SELECT r.*, x.approved_amount, x.amount, x.currency, x.expense_code, x.employee_id
         FROM expense_reimbursements r JOIN expense_claims x ON x.id = r.expense_id
         WHERE r.id = ? FOR UPDATE`,
        [id]
      );
      const record = rows[0];
      if (!record) throw new ApiError(404, 'Reimbursement record not found.');
      if (record.payment_status === 'paid' && status === 'paid')
        throw new ApiError(400, 'This reimbursement has already been marked paid.');

      if (status === 'paid') {
        const [[paidRow]] = await conn.query(
          `SELECT COALESCE(SUM(amount),0) AS paid FROM expense_reimbursements
           WHERE expense_id = ? AND id <> ? AND payment_status = 'paid'`,
          [record.expense_id, id]
        );
        const approved = money(record.approved_amount ?? record.amount);
        if (money(paidRow.paid) + money(record.amount) > approved + 0.005)
          throw new ApiError(400, 'Total reimbursed would exceed the approved claim amount.');
      }

      const paymentDate = req.body?.paymentDate
        ? parseDate(req.body.paymentDate, 'payment date')
        : status === 'paid'
          ? record.payment_date || isoDate()
          : record.payment_date;
      const reference = req.body?.transactionReference !== undefined
        ? cleanText(req.body.transactionReference, 120)
        : record.transaction_reference;
      const notes = req.body?.paymentNotes !== undefined
        ? cleanText(req.body.paymentNotes, 1000)
        : record.payment_notes;

      if (reference) {
        const [dupe] = await conn.query(
          'SELECT id FROM expense_reimbursements WHERE expense_id = ? AND transaction_reference = ? AND id <> ? LIMIT 1',
          [record.expense_id, reference, id]
        );
        if (dupe.length) throw new ApiError(409, 'That transaction reference is already recorded for this claim.');
      }

      await conn.query(
        `UPDATE expense_reimbursements
         SET payment_status = ?, payment_date = ?, transaction_reference = ?, payment_notes = ?
         WHERE id = ?`,
        [status, paymentDate, reference, notes, id]
      );
      await recomputeReimbursementState(conn, record.expense_id);
      const oldStatus = record.payment_status;
      await logActivity(conn, {
        expenseId: record.expense_id,
        userId: req.user.id,
        action: 'reimbursement_status',
        description: `Reimbursement marked ${status.replace(/_/g, ' ')}.`,
        oldStatus,
        newStatus: status,
      });
      await conn.commit();
      await audit(req, {
        action: 'expense.reimbursement.status',
        entity: 'expense_reimbursement',
        entityId: id,
        details: { expense: record.expense_code, status },
      });
      const [fresh] = await pool.query('SELECT * FROM expense_reimbursements WHERE id = ?', [id]);
      res.json({ reimbursement: fresh[0], message: 'Reimbursement status updated.' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

/* ------------------------------------------------------------------ */
/*  Reports                                                            */
/* ------------------------------------------------------------------ */
function reportFilters(query, req, alias = 'x') {
  const where = [];
  const params = [];
  const { from, to } = resolveRange(query);
  if (from) {
    where.push(`${alias}.expense_date >= ?`);
    params.push(from);
  }
  if (to) {
    where.push(`${alias}.expense_date <= ?`);
    params.push(to);
  }
  if (query.employeeId) {
    where.push(`${alias}.employee_id = ?`);
    params.push(Number(query.employeeId));
  }
  if (!req.permissions.includes('expenses.view_all')) {
    where.push(`${alias}.employee_id = ?`);
    params.push(req.user.employeeId || 0);
  }
  if (query.departmentId) {
    where.push(`${alias}.department_id = ?`);
    params.push(Number(query.departmentId));
  }
  if (query.categoryId) {
    where.push(`${alias}.category_id = ?`);
    params.push(Number(query.categoryId));
  }
  if (query.status) {
    where.push(`${alias}.approval_status = ?`);
    params.push(query.status);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params, from, to };
}

router.get(
  '/reports/summary',
  requirePermission('expenses.reports'),
  asyncHandler(async (req, res) => {
    const { clause, params } = reportFilters(req.query, req);
    const [[summary]] = await pool.query(
      `SELECT COUNT(*) AS total_claims,
              COALESCE(SUM(x.amount),0) AS total_amount,
              COALESCE(SUM(CASE WHEN x.approval_status IN ('approved','reimbursement_pending','partially_reimbursed','reimbursed') THEN 1 ELSE 0 END),0) AS approved_count,
              COALESCE(SUM(CASE WHEN x.approval_status IN ('approved','reimbursement_pending','partially_reimbursed','reimbursed') THEN x.approved_amount ELSE 0 END),0) AS approved_amount,
              COALESCE(SUM(CASE WHEN x.approval_status = 'rejected' THEN 1 ELSE 0 END),0) AS rejected_count,
              COALESCE(SUM(CASE WHEN x.approval_status IN ('submitted','under_review','clarification_required') THEN 1 ELSE 0 END),0) AS pending_count
       FROM expense_claims x ${clause}`,
      params
    );
    const [[reimbursement]] = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN r.payment_status = 'paid' THEN r.amount ELSE 0 END),0) AS paid_amount,
              COALESCE(SUM(CASE WHEN r.payment_status IN ('pending','processing','partially_paid') THEN r.amount ELSE 0 END),0) AS pending_amount
       FROM expense_reimbursements r JOIN expense_claims x ON x.id = r.expense_id ${clause}`,
      params
    );
    const [monthly] = await pool.query(
      `SELECT DATE_FORMAT(x.expense_date, '%Y-%m') AS month, COUNT(*) AS count, COALESCE(SUM(x.amount),0) AS amount
       FROM expense_claims x ${clause} GROUP BY DATE_FORMAT(x.expense_date, '%Y-%m') ORDER BY month`,
      params
    );
    res.json({
      summary: {
        totalClaims: Number(summary.total_claims),
        totalAmount: money(summary.total_amount),
        approvedCount: Number(summary.approved_count),
        approvedAmount: money(summary.approved_amount),
        rejectedCount: Number(summary.rejected_count),
        pendingCount: Number(summary.pending_count),
        reimbursedAmount: money(reimbursement.paid_amount),
        pendingReimbursementAmount: money(reimbursement.pending_amount),
      },
      monthly,
    });
  })
);

router.get(
  '/reports/by-category',
  requirePermission('expenses.reports'),
  asyncHandler(async (req, res) => {
    const { clause, params } = reportFilters(req.query, req);
    const [rows] = await pool.query(
      `SELECT c.id, c.name, COUNT(*) AS count, COALESCE(SUM(x.amount),0) AS amount,
              COALESCE(SUM(x.approved_amount),0) AS approved_amount
       FROM expense_claims x JOIN expense_categories c ON c.id = x.category_id
       ${clause} GROUP BY c.id, c.name ORDER BY amount DESC`,
      params
    );
    res.json({ data: rows.map((r) => ({ ...r, amount: money(r.amount), approved_amount: money(r.approved_amount) })) });
  })
);

router.get(
  '/reports/by-department',
  requirePermission('expenses.reports'),
  asyncHandler(async (req, res) => {
    const { clause, params } = reportFilters(req.query, req);
    const [rows] = await pool.query(
      `SELECT COALESCE(d.name,'Unassigned') AS name, COUNT(*) AS count,
              COALESCE(SUM(x.amount),0) AS amount, COALESCE(SUM(x.approved_amount),0) AS approved_amount
       FROM expense_claims x LEFT JOIN hrm_departments d ON d.id = x.department_id
       ${clause} GROUP BY COALESCE(d.name,'Unassigned') ORDER BY amount DESC`,
      params
    );
    res.json({ data: rows.map((r) => ({ ...r, amount: money(r.amount), approved_amount: money(r.approved_amount) })) });
  })
);

router.get(
  '/reports/by-employee',
  requirePermission('expenses.reports'),
  asyncHandler(async (req, res) => {
    const { clause, params } = reportFilters(req.query, req);
    const [rows] = await pool.query(
      `SELECT e.id, e.employee_code, CONCAT(e.first_name,' ',e.last_name) AS name,
              d.name AS department_name, e.avatar_color,
              COUNT(*) AS count, COALESCE(SUM(x.amount),0) AS amount,
              COALESCE(SUM(x.approved_amount),0) AS approved_amount,
              COALESCE(SUM(CASE WHEN x.approval_status = 'rejected' THEN 1 ELSE 0 END),0) AS rejected_count,
              COALESCE(SUM(CASE WHEN x.approval_status = 'reimbursed' THEN x.approved_amount ELSE 0 END),0) AS reimbursed_amount
       FROM expense_claims x
       JOIN hrm_employees e ON e.id = x.employee_id
       LEFT JOIN hrm_departments d ON d.id = e.department_id
       ${clause} GROUP BY e.id, e.employee_code, e.first_name, e.last_name, d.name, e.avatar_color
       ORDER BY amount DESC`,
      params
    );
    res.json({ data: rows.map((r) => ({ ...r, amount: money(r.amount), approved_amount: money(r.approved_amount), reimbursed_amount: money(r.reimbursed_amount) })) });
  })
);

router.get(
  '/reports/reimbursements',
  requirePermission('expenses.reports'),
  asyncHandler(async (req, res) => {
    const { clause, params } = reportFilters(req.query, req);
    const [rows] = await pool.query(
      `SELECT r.payment_status, COUNT(*) AS count, COALESCE(SUM(r.amount),0) AS amount
       FROM expense_reimbursements r
       JOIN expense_claims x ON x.id = r.expense_id
       ${clause} GROUP BY r.payment_status ORDER BY amount DESC`,
      params
    );
    res.json({ data: rows.map((r) => ({ ...r, amount: money(r.amount) })) });
  })
);

/* ------------------------------------------------------------------ */
/*  CSV export                                                         */
/* ------------------------------------------------------------------ */
const csvCell = (value) => {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

router.get(
  '/reports/export',
  requireAnyPermission('expenses.reports', 'expenses.reimburse'),
  asyncHandler(async (req, res) => {
    const type = req.query.type === 'reimbursements' ? 'reimbursements' : 'claims';
    if (type === 'claims' && !req.permissions.includes('expenses.reports'))
      throw new ApiError(403, 'You do not have permission to export claims.');
    const { clause, params } = reportFilters(req.query, req);
    let exportClause = clause;
    let exportParams = params;
    if (type === 'reimbursements' && req.query.paymentStatus) {
      const paymentStatus = String(req.query.paymentStatus);
      if (!PAYMENT_STATUSES.includes(paymentStatus)) throw new ApiError(400, 'Invalid reimbursement status.');
      exportClause += `${exportClause ? ' AND' : 'WHERE'} r.payment_status = ?`;
      exportParams = [...exportParams, paymentStatus];
    }
    let rows;
    if (type === 'reimbursements') {
      [rows] = await pool.query(
        `SELECT x.expense_code, CONCAT(e.first_name,' ',e.last_name) AS employee, e.employee_code,
                x.title, x.expense_date, x.amount AS claim_amount, x.approved_amount,
                r.amount, r.payment_method, r.transaction_reference, r.payment_date, r.payment_status
         FROM expense_reimbursements r
         JOIN expense_claims x ON x.id = r.expense_id
         JOIN hrm_employees e ON e.id = x.employee_id
         ${exportClause} ORDER BY r.created_at DESC`,
        exportParams
      );
    } else {
      [rows] = await pool.query(
        `SELECT x.expense_code, CONCAT(e.first_name,' ',e.last_name) AS employee, e.employee_code,
                COALESCE(d.name,'') AS department, c.name AS category, x.title, x.expense_date,
                x.submitted_at, x.amount, x.currency, x.approval_status, x.reimbursement_status
         FROM expense_claims x
         JOIN hrm_employees e ON e.id = x.employee_id
         LEFT JOIN hrm_departments d ON d.id = x.department_id
         JOIN expense_categories c ON c.id = x.category_id
         ${exportClause} ORDER BY x.expense_date DESC`,
        exportParams
      );
    }
    if (!rows.length) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="aurora-${type}-${isoDate()}.csv"`);
      return res.send('No records found for the selected filters.\n');
    }
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(','), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(','))];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="aurora-${type}-${isoDate()}.csv"`);
    res.send(lines.join('\n'));
  })
);

router.get(
  '/reports/statement',
  requireAnyPermission('expenses.self', 'expenses.reports'),
  asyncHandler(async (req, res) => {
    const requested = req.query.employeeId ? Number(req.query.employeeId) : req.user.employeeId;
    if (!requested) throw new ApiError(400, 'No employee profile is linked to this account.');
    if (requested !== req.user.employeeId && !req.permissions.includes('expenses.view_all'))
      throw new ApiError(403, 'You can only download your own expense statement.');
    const [employeeRows] = await pool.query(
      `SELECT e.*, d.name AS department_name FROM hrm_employees e
       LEFT JOIN hrm_departments d ON d.id = e.department_id WHERE e.id = ?`,
      [requested]
    );
    const employee = employeeRows[0];
    if (!employee) throw new ApiError(404, 'Employee not found.');

    const { from, to } = resolveRange(req.query);
    const where = ['x.employee_id = ?'];
    const params = [requested];
    if (from) {
      where.push('x.expense_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('x.expense_date <= ?');
      params.push(to);
    }
    const [claims] = await pool.query(
      `${CLAIM_SELECT} WHERE ${where.join(' AND ')} ORDER BY x.expense_date DESC`,
      params
    );
    const [reimbursements] = await pool.query(
      `SELECT r.*, x.expense_code, x.title FROM expense_reimbursements r
       JOIN expense_claims x ON x.id = r.expense_id
       WHERE x.employee_id = ? ORDER BY r.created_at DESC`,
      [requested]
    );
    await audit(req, {
      action: 'expense.statement.download',
      entity: 'employee',
      entityId: requested,
      details: { from, to, claims: claims.length },
    });
    const settings = await getSettings();
    const pdf = await generateExpenseStatementPdf({
      employee,
      claims,
      reimbursements,
      from,
      to,
      statementFooter: settings.statement_footer,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="expense-statement-${employee.employee_code}.pdf"`);
    res.send(pdf);
  })
);

/* ------------------------------------------------------------------ */
/*  Create / update claims                                             */
/* ------------------------------------------------------------------ */
router.post(
  '/',
  requirePermission('expenses.self'),
  uploadReceipts,
  asyncHandler(async (req, res) => {
    const files = req.files || [];
    const employeeId = req.user.employeeId;
    if (!employeeId) {
      removeUploadedFiles(files);
      throw new ApiError(400, 'No employee profile is linked to this account.');
    }
    const asDraft = String(req.body?.asDraft || '') === '1' || req.body?.asDraft === true;
    try {
      const settings = await getSettings();
      if (asDraft && String(settings.allow_draft_claims || '1') !== '1')
        throw new ApiError(400, 'Draft claims are disabled by your expense policy.');

      const title = cleanText(req.body?.title, 180);
      if (!title) throw new ApiError(400, 'Expense title is required.');
      const amount = parseAmount(req.body?.amount);
      const expenseDate = parseDate(req.body?.expenseDate, 'expense date');
      if (isFutureDate(expenseDate)) throw new ApiError(400, 'Expense date cannot be in the future.');
      const categoryId = Number(req.body?.categoryId);
      if (!categoryId) throw new ApiError(400, 'Expense category is required.');
      const currency = validCurrency(req.body?.currency || settings.default_currency || 'USD');
      const purpose = cleanText(req.body?.purpose, 2000);
      if (!purpose) throw new ApiError(400, 'Purpose / description is required.');

      const [empRows] = await pool.query('SELECT id, department_id FROM hrm_employees WHERE id = ? LIMIT 1', [employeeId]);
      const employee = empRows[0];
      if (!employee) throw new ApiError(400, 'Your employee profile could not be found.');
      let departmentId = employee.department_id;
      if (!departmentId && req.body?.departmentId) {
        const deptId = Number(req.body.departmentId);
        const [dept] = await pool.query('SELECT id FROM hrm_departments WHERE id = ? LIMIT 1', [deptId]);
        if (!dept.length) throw new ApiError(400, 'Please choose a valid department.');
        departmentId = deptId;
      }

      await checkReceiptAndPolicy({
        categoryId,
        amount,
        attachmentCount: files.length,
        settings,
        isDraft: asDraft,
      });

      const conn = await pool.getConnection();
      let createdId;
      try {
        await conn.beginTransaction();
        if (!asDraft) {
          await assertNoDuplicate(conn, { employeeId, amount, expenseDate, categoryId, files });
        }
        const [result] = await conn.query(
          `INSERT INTO expense_claims
            (expense_code, employee_id, department_id, category_id, title, expense_date, amount, currency, purpose,
             project_name, client_name, vendor_name, merchant_name, additional_notes, approval_status, submitted_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           `,
          [
            `TMP-${crypto.randomBytes(12).toString('hex')}`,
            employeeId,
            departmentId || null,
            categoryId,
            title,
            expenseDate,
            amount,
            currency,
            purpose,
            cleanText(req.body?.projectName, 150),
            cleanText(req.body?.clientName, 150),
            cleanText(req.body?.vendorName, 150),
            cleanText(req.body?.merchantName, 150),
            cleanText(req.body?.additionalNotes, 2000),
            asDraft ? 'draft' : 'submitted',
            asDraft ? null : new Date(),
          ]
        );
        createdId = result.insertId;
        const code = await nextExpenseCode(conn, createdId);
        await saveUploadedAttachments(conn, createdId, files, req.user.id);
        await logActivity(conn, {
          expenseId: createdId,
          userId: req.user.id,
          action: asDraft ? 'draft_created' : 'submitted',
          description: asDraft ? 'Expense draft created.' : `Expense ${code} submitted for approval.`,
          newStatus: asDraft ? 'draft' : 'submitted',
        });
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }

      const claim = await loadClaim(createdId);
      await audit(req, {
        action: asDraft ? 'expense.draft.create' : 'expense.submit',
        entity: 'expense_claim',
        entityId: createdId,
        details: { code: claim.expense_code, amount, category: claim.category_name },
      });
      res.status(201).json({
        claim,
        message: asDraft ? 'Expense saved as draft.' : 'Expense submitted for approval.',
      });
    } catch (err) {
      removeUploadedFiles(files);
      throw err;
    }
  })
);

router.put(
  '/:id',
  requirePermission('expenses.self'),
  uploadReceipts,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const files = req.files || [];
    try {
      const claim = await loadClaim(id);
      if (!claim) throw new ApiError(404, 'Expense claim not found.');
      assertOwnerEditable(req, claim);

      const settings = await getSettings();
      const title = cleanText(req.body?.title, 180) || claim.title;
      const amount = req.body?.amount != null && req.body?.amount !== '' ? parseAmount(req.body.amount) : money(claim.amount);
      const expenseDate = req.body?.expenseDate ? parseDate(req.body.expenseDate, 'expense date') : claim.expense_date;
      if (isFutureDate(expenseDate)) throw new ApiError(400, 'Expense date cannot be in the future.');
      const categoryId = req.body?.categoryId ? Number(req.body.categoryId) : claim.category_id;
      const currency = req.body?.currency ? validCurrency(req.body.currency) : claim.currency;
      const purpose = req.body?.purpose !== undefined ? cleanText(req.body.purpose, 2000) : claim.purpose;
      if (!purpose) throw new ApiError(400, 'Purpose / description is required.');

      let removeIds = [];
      if (req.body?.removeAttachmentIds) {
        try {
          removeIds = JSON.parse(req.body.removeAttachmentIds);
        } catch {
          removeIds = String(req.body.removeAttachmentIds).split(',').map((v) => Number(v)).filter(Boolean);
        }
      }
      removeIds = Array.isArray(removeIds) ? removeIds.map(Number).filter(Boolean) : [];

      const [attachments] = await pool.query(
        'SELECT * FROM expense_attachments WHERE expense_id = ?',
        [id]
      );
      const kept = attachments.filter((a) => !removeIds.includes(a.id));
      const totalAfter = kept.length + files.length;
      const isDraft = claim.approval_status === 'draft';
      await checkReceiptAndPolicy({
        categoryId,
        amount,
        attachmentCount: totalAfter,
        settings,
        isDraft,
      });
      if (totalAfter > Number(settings.max_attachments_per_expense || 5))
        throw new ApiError(400, `You can attach up to ${settings.max_attachments_per_expense || 5} receipts per claim.`);

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        if (!isDraft) {
          await assertNoDuplicate(conn, {
            employeeId: claim.employee_id,
            amount,
            expenseDate,
            categoryId,
            files,
            excludeId: id,
          });
        }
        await conn.query(
          `UPDATE expense_claims SET title = ?, expense_date = ?, amount = ?, currency = ?, purpose = ?,
             category_id = ?, project_name = ?, client_name = ?, vendor_name = ?, merchant_name = ?,
             additional_notes = ?
           WHERE id = ?`,
          [
            title,
            expenseDate,
            amount,
            currency,
            purpose,
            categoryId,
            req.body?.projectName !== undefined ? cleanText(req.body.projectName, 150) : claim.project_name,
            req.body?.clientName !== undefined ? cleanText(req.body.clientName, 150) : claim.client_name,
            req.body?.vendorName !== undefined ? cleanText(req.body.vendorName, 150) : claim.vendor_name,
            req.body?.merchantName !== undefined ? cleanText(req.body.merchantName, 150) : claim.merchant_name,
            req.body?.additionalNotes !== undefined ? cleanText(req.body.additionalNotes, 2000) : claim.additional_notes,
            id,
          ]
        );
        for (const attachmentId of removeIds) {
          const attachment = attachments.find((a) => a.id === attachmentId);
          if (!attachment) continue;
          await conn.query('DELETE FROM expense_attachments WHERE id = ? AND expense_id = ?', [attachmentId, id]);
          removeReceipt(attachment.stored_name);
        }
        await saveUploadedAttachments(conn, id, files, req.user.id);
        await logActivity(conn, {
          expenseId: id,
          userId: req.user.id,
          action: 'updated',
          description: 'Expense claim details updated.',
          oldStatus: claim.approval_status,
          newStatus: claim.approval_status,
        });
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }

      await audit(req, { action: 'expense.update', entity: 'expense_claim', entityId: id, details: { code: claim.expense_code } });
      res.json({ claim: await loadClaim(id), message: 'Expense claim updated.' });
    } catch (err) {
      removeUploadedFiles(files);
      throw err;
    }
  })
);

router.post(
  '/:id/submit',
  requirePermission('expenses.self'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const claim = await loadClaim(id);
    if (!claim) throw new ApiError(404, 'Expense claim not found.');
    if (claim.employee_id !== req.user.employeeId) throw new ApiError(403, 'You can only submit your own claims.');
    if (!['draft', 'clarification_required'].includes(claim.approval_status))
      throw new ApiError(400, 'This claim is not in a submittable state.');

    const settings = await getSettings();
    const [[countRow]] = await pool.query(
      'SELECT COUNT(*) AS count FROM expense_attachments WHERE expense_id = ?',
      [id]
    );
    await checkReceiptAndPolicy({
      categoryId: claim.category_id,
      amount: money(claim.amount),
      attachmentCount: Number(countRow.count),
      settings,
      isDraft: false,
    });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await assertNoDuplicate(conn, {
        employeeId: claim.employee_id,
        amount: money(claim.amount),
        expenseDate: claim.expense_date,
        categoryId: claim.category_id,
        files: [],
        excludeId: id,
      });
      const isResubmit = claim.approval_status === 'clarification_required';
      await conn.query(
        `UPDATE expense_claims SET approval_status = 'submitted', submitted_at = NOW() WHERE id = ?`,
        [id]
      );
      await conn.query(
        `INSERT INTO expense_approvals (expense_id, approver_id, action, comments) VALUES (?,?,?,?)`,
        [id, req.user.id, isResubmit ? 'resubmitted' : 'submitted', isResubmit ? 'Claim resubmitted after clarification.' : null]
      );
      await logActivity(conn, {
        expenseId: id,
        userId: req.user.id,
        action: isResubmit ? 'resubmitted' : 'submitted',
        description: isResubmit ? 'Claim resubmitted after clarification.' : 'Claim submitted for approval.',
        oldStatus: claim.approval_status,
        newStatus: 'submitted',
      });
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    await audit(req, { action: 'expense.submit', entity: 'expense_claim', entityId: id, details: { code: claim.expense_code } });
    res.json({ claim: await loadClaim(id), message: 'Expense submitted for approval.' });
  })
);

router.post(
  '/:id/cancel',
  requireAnyPermission('expenses.self', 'expenses.approve'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const claim = await loadClaim(id);
    if (!claim) throw new ApiError(404, 'Expense claim not found.');
    const isOwner = claim.employee_id === req.user.employeeId;
    if (!isOwner && !req.permissions.includes('expenses.approve'))
      throw new ApiError(403, 'You cannot cancel this claim.');
    if (!['draft', 'submitted', 'under_review', 'clarification_required'].includes(claim.approval_status))
      throw new ApiError(400, 'This claim can no longer be cancelled.');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE expense_claims SET approval_status = 'cancelled', cancelled_at = NOW() WHERE id = ?`,
        [id]
      );
      await conn.query(
        `INSERT INTO expense_approvals (expense_id, approver_id, action, comments) VALUES (?,?,?,?)`,
        [id, req.user.id, 'cancelled', cleanText(req.body?.reason, 500) || 'Claim cancelled.']
      );
      await logActivity(conn, {
        expenseId: id,
        userId: req.user.id,
        action: 'cancelled',
        description: cleanText(req.body?.reason, 500) || 'Claim cancelled.',
        oldStatus: claim.approval_status,
        newStatus: 'cancelled',
      });
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    await audit(req, { action: 'expense.cancel', entity: 'expense_claim', entityId: id, details: { code: claim.expense_code } });
    res.json({ claim: await loadClaim(id), message: 'Expense claim cancelled.' });
  })
);

/* ------------------------------------------------------------------ */
/*  Approval actions                                                   */
/* ------------------------------------------------------------------ */
async function approvalAction(req, res, { action, nextStatus, requireReason = false, requireComment = false }) {
  const id = Number(req.params.id);
  const claim = await loadClaim(id);
  if (!claim) throw new ApiError(404, 'Expense claim not found.');
  if (claim.employee_id === req.user.employeeId)
    throw new ApiError(403, 'You cannot approve your own expense claim.');
  if (!['submitted', 'under_review', 'clarification_required'].includes(claim.approval_status))
    throw new ApiError(400, 'This claim is no longer awaiting an approval decision.');

  const comments = cleanText(req.body?.comments, 2000);
  const rejectionReason = cleanText(req.body?.rejectionReason, 2000);
  if (requireReason && !rejectionReason) throw new ApiError(400, 'A rejection reason is required.');
  if (requireComment && !comments) throw new ApiError(400, 'Please add a comment for the employee.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [locked] = await conn.query('SELECT approval_status FROM expense_claims WHERE id = ? FOR UPDATE', [id]);
    if (!locked.length || locked[0].approval_status !== claim.approval_status)
      throw new ApiError(409, 'This claim was updated by someone else. Refresh and try again.');

    if (action === 'approved') {
      await conn.query(
        `UPDATE expense_claims SET approval_status = 'approved', approved_amount = amount, approved_at = NOW(),
           reimbursement_status = 'pending' WHERE id = ?`,
        [id]
      );
    } else {
      await conn.query('UPDATE expense_claims SET approval_status = ? WHERE id = ?', [nextStatus, id]);
    }
    await conn.query(
      `INSERT INTO expense_approvals (expense_id, approver_id, action, comments, rejection_reason)
       VALUES (?,?,?,?,?)`,
      [id, req.user.id, action, comments, rejectionReason]
    );
    await logActivity(conn, {
      expenseId: id,
      userId: req.user.id,
      action,
      description:
        action === 'approved'
          ? `Claim approved by ${req.user.name}.`
          : action === 'rejected'
            ? `Claim rejected${rejectionReason ? `: ${rejectionReason}` : '.'}`
            : `Clarification requested: ${comments}`,
      oldStatus: claim.approval_status,
      newStatus: nextStatus,
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await audit(req, {
    action: `expense.${action}`,
    entity: 'expense_claim',
    entityId: id,
    details: { code: claim.expense_code, amount: claim.amount, comments, rejectionReason },
  });

  const messages = {
    approved: 'Expense claim approved.',
    rejected: 'Expense claim rejected.',
    clarification_requested: 'Clarification requested from the employee.',
  };
  res.json({ claim: await loadClaim(id), message: messages[action] });
}

router.post(
  '/:id/approve',
  requirePermission('expenses.approve'),
  asyncHandler((req, res) => approvalAction(req, res, { action: 'approved', nextStatus: 'approved' }))
);

router.post(
  '/:id/reject',
  requirePermission('expenses.approve'),
  asyncHandler((req, res) => approvalAction(req, res, { action: 'rejected', nextStatus: 'rejected', requireReason: true }))
);

router.post(
  '/:id/request-clarification',
  requirePermission('expenses.approve'),
  asyncHandler((req, res) =>
    approvalAction(req, res, { action: 'clarification_requested', nextStatus: 'clarification_required', requireComment: true })
  )
);

router.post(
  '/:id/review',
  requirePermission('expenses.approve'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [result] = await pool.query(
      `UPDATE expense_claims SET approval_status = 'under_review'
       WHERE id = ? AND approval_status = 'submitted' AND employee_id <> ?`,
      [id, req.user.employeeId || 0]
    );
    if (!result.affectedRows) {
      const claim = await loadClaim(id);
      if (!claim) throw new ApiError(404, 'Expense claim not found.');
      if (claim.employee_id === req.user.employeeId) throw new ApiError(403, 'You cannot review your own claim.');
      return res.json({ claim, message: 'Claim is already under review.' });
    }
    await logActivity(pool, {
      expenseId: id,
      userId: req.user.id,
      action: 'under_review',
      description: 'Claim opened for review.',
      newStatus: 'under_review',
    });
    res.json({ claim: await loadClaim(id), message: 'Claim marked under review.' });
  })
);

/* ------------------------------------------------------------------ */
/*  Reimbursements — create                                            */
/* ------------------------------------------------------------------ */
router.post(
  '/:id/reimbursements',
  requirePermission('expenses.reimburse'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const amount = parseAmount(req.body?.amount);
    const method = String(req.body?.paymentMethod || 'bank_transfer');
    if (!PAYMENT_METHODS.includes(method)) throw new ApiError(400, 'Please choose a valid payment method.');
    const paymentStatus = String(req.body?.paymentStatus || 'pending');
    if (!PAYMENT_STATUSES.includes(paymentStatus)) throw new ApiError(400, 'Invalid payment status.');
    const reference = cleanText(req.body?.transactionReference, 120);
    const notes = cleanText(req.body?.paymentNotes, 1000);
    const paymentDate = req.body?.paymentDate ? parseDate(req.body.paymentDate, 'payment date') : null;
    if (paymentStatus === 'paid' && !paymentDate)
      throw new ApiError(400, 'Payment date is required when marking a reimbursement paid.');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query('SELECT * FROM expense_claims WHERE id = ? FOR UPDATE', [id]);
      const claim = rows[0];
      if (!claim) throw new ApiError(404, 'Expense claim not found.');
      if (!REIMBURSABLE.includes(claim.approval_status))
        throw new ApiError(400, 'Only approved expense claims can be reimbursed.');

      const approved = money(claim.approved_amount ?? claim.amount);
      const [[sumRow]] = await conn.query(
        `SELECT COALESCE(SUM(amount),0) AS committed FROM expense_reimbursements
         WHERE expense_id = ? AND payment_status IN ('pending','processing','partially_paid','paid')`,
        [id]
      );
      const outstanding = money(approved - money(sumRow.committed));
      if (outstanding <= 0) throw new ApiError(400, 'This claim has already been fully reimbursed.');
      if (amount > outstanding + 0.005)
        throw new ApiError(400, `Reimbursement cannot exceed the outstanding approved amount of ${outstanding.toFixed(2)}.`);

      if (reference) {
        const [dupeRef] = await conn.query(
          'SELECT id FROM expense_reimbursements WHERE expense_id = ? AND transaction_reference = ? LIMIT 1',
          [id, reference]
        );
        if (dupeRef.length) throw new ApiError(409, 'That transaction reference is already recorded for this claim.');
      }
      const [dupePayment] = await conn.query(
        `SELECT id FROM expense_reimbursements
         WHERE expense_id = ? AND amount = ? AND payment_method = ? AND payment_status <> 'failed'
           AND COALESCE(payment_date, DATE(created_at)) = COALESCE(?, DATE(created_at))
         LIMIT 1`,
        [id, amount, method, paymentDate]
      );
      if (dupePayment.length) throw new ApiError(409, 'A matching reimbursement record already exists for this claim.');

      const [result] = await conn.query(
        `INSERT INTO expense_reimbursements
          (expense_id, amount, payment_method, transaction_reference, payment_date, payment_status, payment_notes, processed_by)
         VALUES (?,?,?,?,?,?,?,?)`,
        [id, amount, method, reference, paymentDate, paymentStatus, notes, req.user.id]
      );
      await recomputeReimbursementState(conn, id);
      await logActivity(conn, {
        expenseId: id,
        userId: req.user.id,
        action: 'reimbursement_recorded',
        description: `Reimbursement of ${amount.toFixed(2)} ${claim.currency} recorded (${method.replace(/_/g, ' ')}).`,
        oldStatus: claim.approval_status,
        newStatus: 'reimbursement_pending',
      });
      await conn.commit();

      await audit(req, {
        action: 'expense.reimbursement.create',
        entity: 'expense_reimbursement',
        entityId: result.insertId,
        details: { expense: claim.expense_code, amount, method, paymentStatus, reference },
      });
      const [fresh] = await pool.query('SELECT * FROM expense_reimbursements WHERE id = ?', [result.insertId]);
      res.status(201).json({ reimbursement: fresh[0], claim: await loadClaim(id), message: 'Reimbursement recorded.' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

/* ------------------------------------------------------------------ */
/*  Claim detail, attachments, history                                 */
/* ------------------------------------------------------------------ */
router.get(
  '/:id/attachments/:attachmentId',
  requireAnyPermission('expenses.self', 'expenses.view_all', 'expenses.approve', 'expenses.reimburse'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const claim = await loadClaim(id);
    if (!claim) throw new ApiError(404, 'Expense claim not found.');
    if (!canViewClaim(req, claim)) throw new ApiError(403, 'You do not have access to this receipt.');
    const [rows] = await pool.query(
      'SELECT * FROM expense_attachments WHERE id = ? AND expense_id = ? LIMIT 1',
      [Number(req.params.attachmentId), id]
    );
    const attachment = rows[0];
    if (!attachment) throw new ApiError(404, 'Receipt not found.');
    const full = receiptPath(attachment.stored_name);
    await audit(req, {
      action: 'expense.receipt.download',
      entity: 'expense_attachment',
      entityId: attachment.id,
      details: { expense: claim.expense_code },
    });
    res.download(full, attachment.file_name || 'receipt');
  })
);

router.post(
  '/:id/attachments',
  requirePermission('expenses.self'),
  uploadReceipts,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const files = req.files || [];
    if (!files.length) throw new ApiError(400, 'Please choose at least one receipt.');
    try {
      const claim = await loadClaim(id);
      if (!claim) throw new ApiError(404, 'Expense claim not found.');
      assertOwnerEditable(req, claim);
      const settings = await getSettings();
      const max = Number(settings.max_attachments_per_expense || 5);
      if (Number(claim.attachment_count) + files.length > max)
        throw new ApiError(400, `You can attach up to ${max} receipts per claim.`);
      for (const file of files) {
        const sizeMb = file.size / (1024 * 1024);
        if (sizeMb > Number(settings.max_attachment_mb || 10))
          throw new ApiError(400, `Each receipt must be ${settings.max_attachment_mb || 10} MB or smaller.`);
      }
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await saveUploadedAttachments(conn, id, files, req.user.id);
        await logActivity(conn, {
          expenseId: id,
          userId: req.user.id,
          action: 'attachments_added',
          description: `${files.length} receipt(s) added.`,
        });
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
      res.json({ claim: await loadClaim(id), message: 'Receipts uploaded.' });
    } catch (err) {
      removeUploadedFiles(files);
      throw err;
    }
  })
);

router.delete(
  '/:id/attachments/:attachmentId',
  requirePermission('expenses.self'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const claim = await loadClaim(id);
    if (!claim) throw new ApiError(404, 'Expense claim not found.');
    assertOwnerEditable(req, claim);
    const [rows] = await pool.query(
      'SELECT * FROM expense_attachments WHERE id = ? AND expense_id = ? LIMIT 1',
      [Number(req.params.attachmentId), id]
    );
    if (!rows.length) throw new ApiError(404, 'Receipt not found.');
    await pool.query('DELETE FROM expense_attachments WHERE id = ?', [rows[0].id]);
    removeReceipt(rows[0].stored_name);
    await logActivity(pool, {
      expenseId: id,
      userId: req.user.id,
      action: 'attachment_removed',
      description: `Receipt ${rows[0].file_name} removed.`,
    });
    res.json({ claim: await loadClaim(id), message: 'Receipt removed.' });
  })
);

router.get(
  '/:id/approvals',
  requireAnyPermission('expenses.self', 'expenses.view_all', 'expenses.approve', 'expenses.reimburse'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const claim = await loadClaim(id);
    if (!claim) throw new ApiError(404, 'Expense claim not found.');
    if (!canViewClaim(req, claim)) throw new ApiError(403, 'You do not have access to this claim.');
    const [rows] = await pool.query(
      `SELECT ap.*, u.name AS approver_name, u.role AS approver_role
       FROM expense_approvals ap LEFT JOIN hrm_users u ON u.id = ap.approver_id
       WHERE ap.expense_id = ? ORDER BY ap.action_date ASC, ap.id ASC`,
      [id]
    );
    res.json({ data: rows });
  })
);

router.get(
  '/:id/activity',
  requireAnyPermission('expenses.self', 'expenses.view_all', 'expenses.approve', 'expenses.reimburse'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const claim = await loadClaim(id);
    if (!claim) throw new ApiError(404, 'Expense claim not found.');
    if (!canViewClaim(req, claim)) throw new ApiError(403, 'You do not have access to this claim.');
    const [rows] = await pool.query(
      `SELECT l.*, u.name AS user_name FROM expense_activity_logs l
       LEFT JOIN hrm_users u ON u.id = l.user_id
       WHERE l.expense_id = ? ORDER BY l.created_at ASC, l.id ASC`,
      [id]
    );
    res.json({ data: rows });
  })
);

router.get(
  '/:id',
  requireAnyPermission('expenses.self', 'expenses.view_all', 'expenses.approve', 'expenses.reimburse'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const claim = await loadClaim(id);
    if (!claim) throw new ApiError(404, 'Expense claim not found.');
    if (!canViewClaim(req, claim)) throw new ApiError(403, 'You do not have access to this claim.');

    const [attachments] = await pool.query(
      `SELECT a.id, a.expense_id, a.file_name, a.file_type, a.file_size, a.created_at, u.name AS uploaded_by_name
       FROM expense_attachments a LEFT JOIN hrm_users u ON u.id = a.uploaded_by
       WHERE a.expense_id = ? ORDER BY a.created_at ASC`,
      [id]
    );
    const [approvals] = await pool.query(
      `SELECT ap.*, u.name AS approver_name, u.role AS approver_role
       FROM expense_approvals ap LEFT JOIN hrm_users u ON u.id = ap.approver_id
       WHERE ap.expense_id = ? ORDER BY ap.action_date ASC, ap.id ASC`,
      [id]
    );
    const [reimbursements] = await pool.query(
      `SELECT r.*, u.name AS processed_by_name FROM expense_reimbursements r
       LEFT JOIN hrm_users u ON u.id = r.processed_by
       WHERE r.expense_id = ? ORDER BY r.created_at ASC`,
      [id]
    );
    const [activity] = await pool.query(
      `SELECT l.*, u.name AS user_name FROM expense_activity_logs l
       LEFT JOIN hrm_users u ON u.id = l.user_id
       WHERE l.expense_id = ? ORDER BY l.created_at ASC, l.id ASC`,
      [id]
    );
    res.json({ claim, attachments, approvals, reimbursements, activity });
  })
);

export default router;

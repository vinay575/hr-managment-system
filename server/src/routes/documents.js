import { Router } from 'express';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import pool from '../db.js';
import { asyncHandler, ApiError, isoDate } from '../utils.js';
import { authenticate, requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { audit } from '../audit.js';
import { uploadDocumentMiddleware, validateDocumentContent, normalizedMime, safeOriginalName } from '../document-upload.js';
import { getDocPath } from '../services/document-storage.js';
import { generateExitDocPdf } from '../services/pdf.js';
import { buildStorageKey, putDocument, getDocumentStream, deleteDocumentFile } from '../services/document-store.js';
import {
  assertDocumentEnabled,
  canViewDocument,
  computeMissingDocuments,
  documentHash,
  expiryInfo,
  getCategoryMap,
  getDocumentSettings,
  listAllDocuments,
  loadDocumentByIdentity,
  logActivity,
  logVerification,
  nextDocumentNumber,
  paginate,
  settingFlag,
  toCsv,
} from '../services/documents.js';
import { notifyDocumentVerifiers, notifyEmployee, runDocumentReminders } from '../services/document-notifications.js';

const router = Router();
router.use(authenticate);

const VIEW = requireAnyPermission('documents.view', 'documents.self');
const MANAGE = requirePermission('documents.manage');
const VERIFY = requirePermission('documents.verify');
const CATEGORIES = requirePermission('documents.categories.manage');
const REPORTS = requirePermission('documents.reports');
const SETTINGS = requirePermission('documents.settings');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value, max = 500) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

function parseDate(value, label) {
  if (value == null || value === '') return null;
  const s = String(value).slice(0, 10);
  if (!DATE_RE.test(s)) throw new ApiError(400, `Please enter a valid ${label}.`);
  return s;
}

function ownOnly(req) {
  return !req.permissions.includes('documents.view');
}

function isOwner(req, doc) {
  return Boolean(req.user.employeeId) && Number(doc.employee_id) === Number(req.user.employeeId);
}

function assertView(req, doc) {
  if (!canViewDocument(req, doc)) throw new ApiError(403, 'You do not have permission to view this document.');
}

function assertManageOrOwner(req, doc) {
  if (!req.permissions.includes('documents.manage') && !isOwner(req, doc)) {
    throw new ApiError(403, 'You can only manage your own documents.');
  }
}

function filterRows(rows, query) {
  let result = rows;
  if (query.status) result = result.filter((row) => row.status === query.status);
  if (query.departmentId) result = result.filter((row) => Number(row.department_id) === Number(query.departmentId));
  if (query.categoryId) result = result.filter((row) => Number(row.category_id) === Number(query.categoryId));
  if (query.employeeId) result = result.filter((row) => Number(row.employee_id) === Number(query.employeeId));
  if (query.search) {
    const q = String(query.search).toLowerCase();
    result = result.filter((row) =>
      `${row.employee_name} ${row.employee_code} ${row.category_name}`.toLowerCase().includes(q)
    );
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */
router.get(
  '/dashboard',
  VIEW,
  asyncHandler(async (req, res) => {
    const settings = await getDocumentSettings();
    const categories = await getCategoryMap();
    const scopeEmployee = ownOnly(req) ? req.user.employeeId || -1 : null;
    const documents = await listAllDocuments(req, {}, { ownEmployeeId: scopeEmployee, categories });
    const missing = await computeMissingDocuments({
      ownEmployeeId: scopeEmployee,
      documents: scopeEmployee ? documents : null,
      categories,
    });

    const summary = {
      total: documents.length,
      verified: documents.filter((d) => d.status === 'verified').length,
      pending: documents.filter((d) => d.status === 'pending').length,
      rejected: documents.filter((d) => d.status === 'rejected').length,
      expired: documents.filter((d) => d.expiry_status === 'expired').length,
      expiringSoon: documents.filter((d) => d.expiry_status === 'expiring').length,
      missing: missing.rows.filter((r) => r.status === 'missing' || r.status === 'rejected').length,
      employeesComplete: missing.completeCount,
      employeesIncomplete: missing.incompleteCount,
      warningDays: Number(settings.expiry_warning_days) || 30,
    };

    const expiryBuckets = [7, 30, 60, 90].map((days) => ({
      days,
      label: `Within ${days} days`,
      count: documents.filter(
        (d) => d.expiry_date && d.days_remaining != null && d.days_remaining >= 0 && d.days_remaining <= days
      ).length,
    }));

    // Employee-first view: the dashboard lists people, not a flat document log.
    // Each row carries enough counters to see file health at a glance; the
    // employee summary endpoint then returns only that person's documents.
    const byEmployee = new Map();
    for (const doc of documents) {
      const key = Number(doc.employee_id);
      if (!byEmployee.has(key)) byEmployee.set(key, []);
      byEmployee.get(key).push(doc);
    }
    const outstandingByEmployee = new Map();
    for (const row of missing.rows) {
      if (row.status !== 'missing' && row.status !== 'rejected') continue;
      const key = Number(row.employee_id);
      outstandingByEmployee.set(key, (outstandingByEmployee.get(key) || 0) + 1);
    }
    const employeeFiles = missing.employees
      .map((emp) => {
        const docs = byEmployee.get(Number(emp.id)) || [];
        const lastUploadedAt = docs.reduce((latest, doc) => {
          const value = doc.uploaded_at ? String(doc.uploaded_at) : '';
          return value > latest ? value : latest;
        }, '');
        return {
          employee_id: emp.id,
          employee_name: emp.employee_name,
          employee_code: emp.employee_code,
          avatar_color: emp.avatar_color,
          department_id: emp.department_id,
          department_name: emp.department_name,
          total: docs.length,
          verified: docs.filter((d) => d.status === 'verified').length,
          pending: docs.filter((d) => d.status === 'pending').length,
          rejected: docs.filter((d) => d.status === 'rejected').length,
          expiring: docs.filter((d) => d.expiry_status === 'expiring').length,
          expired: docs.filter((d) => d.expiry_status === 'expired').length,
          missing: outstandingByEmployee.get(Number(emp.id)) || 0,
          complete: missing.complete.get(emp.id) === true,
          last_uploaded_at: lastUploadedAt || null,
        };
      })
      .sort((a, b) => b.total - a.total || String(a.employee_name).localeCompare(String(b.employee_name)));

    res.json({
      employeeFiles,
      summary,
      verificationSummary: [
        { key: 'verified', label: 'Verified', count: summary.verified },
        { key: 'pending', label: 'Pending', count: summary.pending },
        { key: 'rejected', label: 'Rejected', count: summary.rejected },
        { key: 'expired', label: 'Expired', count: summary.expired },
      ],
      expiryOverview: { buckets: expiryBuckets, expired: summary.expired },
      recent: documents.slice(0, 8),
      attention: {
        pending: documents.filter((d) => d.status === 'pending').slice(0, 6),
        expired: documents.filter((d) => d.expiry_status === 'expired').slice(0, 6),
        expiring: documents.filter((d) => d.expiry_status === 'expiring').slice(0, 6),
        rejected: documents.filter((d) => d.status === 'rejected').slice(0, 6),
      },
      missingSummary: {
        requiredCategories: missing.required.length,
        completeEmployees: missing.completeCount,
        incompleteEmployees: missing.incompleteCount,
        missingRows: missing.rows.filter((r) => r.status === 'missing' || r.status === 'rejected').length,
      },
      categories: categories.rows.filter((c) => Number(c.is_active)).length,
      settings: { expiry_warning_days: settings.expiry_warning_days },
    });
  })
);

/* ------------------------------------------------------------------ */
/*  List / my documents                                                */
/* ------------------------------------------------------------------ */
router.get(
  '/',
  requirePermission('documents.view'),
  asyncHandler(async (req, res) => {
    const filters = {
      employeeId: req.query.employeeId || req.query.employee_id,
      departmentId: req.query.departmentId || req.query.department_id,
      categoryId: req.query.categoryId || req.query.category_id,
      status: req.query.status,
      expiryStatus: req.query.expiryStatus || req.query.expiry_status,
      days: req.query.days,
      search: req.query.search,
      from: req.query.from,
      to: req.query.to,
      source: req.query.source,
      sort: req.query.sort,
    };
    const documents = await listAllDocuments(req, filters, {
      ownEmployeeId: ownOnly(req) ? req.user.employeeId || -1 : null,
    });
    res.json(paginate(documents, req.query));
  })
);

router.get(
  '/directory',
  VIEW,
  asyncHandler(async (req, res) => {
    const scope = String(req.query.scope || 'all');
    const filters = {
      employeeId: req.query.employeeId || req.query.employee_id,
      departmentId: req.query.departmentId || req.query.department_id,
      categoryId: req.query.categoryId || req.query.category_id,
      status: req.query.status,
      expiryStatus: req.query.expiryStatus || req.query.expiry_status,
      days: req.query.days,
      search: req.query.search,
      from: req.query.from,
      to: req.query.to,
      source: req.query.source,
    };
    const categories = await getCategoryMap();
    const scopeEmployee = ownOnly(req) ? req.user.employeeId || -1 : null;

    if (scope === 'missing') {
      const allDocuments = await listAllDocuments(req, {}, { ownEmployeeId: scopeEmployee, categories });
      const missing = await computeMissingDocuments({
        ownEmployeeId: scopeEmployee,
        documents: allDocuments,
        categories,
      });
      let rows = filterRows(missing.rows, {
        employeeId: filters.employeeId,
        departmentId: filters.departmentId,
        categoryId: filters.categoryId,
        status: filters.status,
        search: filters.search,
      });
      if (String(req.query.onlyMissing || '') === '1') {
        rows = rows.filter((row) => row.status === 'missing' || row.status === 'rejected');
      }

      const byEmployee = new Map();
      for (const row of rows) {
        const id = Number(row.employee_id);
        if (!byEmployee.has(id)) {
          byEmployee.set(id, {
            employee_id: row.employee_id,
            employee_name: row.employee_name,
            employee_code: row.employee_code,
            avatar_color: row.avatar_color,
            department_id: row.department_id,
            department_name: row.department_name,
            total: 0,
            missing: 0,
            pending: 0,
            rejected: 0,
            verified: 0,
            expired: 0,
            expiring: 0,
            complete: missing.complete.get(row.employee_id) === true,
            categories: new Set(),
          });
        }
        const entry = byEmployee.get(id);
        entry.total += 1;
        if (row.status === 'missing') entry.missing += 1;
        else if (row.status === 'pending') entry.pending += 1;
        else if (row.status === 'rejected') entry.rejected += 1;
        else if (row.status === 'verified') entry.verified += 1;
        else if (row.status === 'expired') entry.expired += 1;
        if (row.category_name) entry.categories.add(row.category_name);
      }

      const data = [...byEmployee.values()]
        .map((entry) => ({ ...entry, categories: [...entry.categories] }))
        .sort((a, b) => b.total - a.total || String(a.employee_name).localeCompare(String(b.employee_name)));
      const counts = rows.reduce((acc, row) => {
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
      }, {});
      return res.json({
        data,
        totalEmployees: data.length,
        totalRequirements: rows.length,
        counts,
        summary: {
          requiredCategories: missing.required.length,
          completeEmployees: missing.completeCount,
          incompleteEmployees: missing.incompleteCount,
        },
      });
    }

    const documents = await listAllDocuments(req, filters, { ownEmployeeId: scopeEmployee, categories });
    const byEmployee = new Map();
    for (const doc of documents) {
      const id = Number(doc.employee_id);
      if (!byEmployee.has(id)) {
        byEmployee.set(id, {
          employee_id: doc.employee_id,
          employee_name: doc.employee_name,
          employee_code: doc.employee_code,
          avatar_color: doc.avatar_color,
          department_id: doc.department_id,
          department_name: doc.department_name,
          total: 0,
          verified: 0,
          pending: 0,
          rejected: 0,
          expiring: 0,
          expired: 0,
          last_uploaded_at: null,
          categories: new Set(),
        });
      }
      const entry = byEmployee.get(id);
      entry.total += 1;
      if (doc.status === 'verified') entry.verified += 1;
      else if (doc.status === 'pending') entry.pending += 1;
      else if (doc.status === 'rejected') entry.rejected += 1;
      if (doc.expiry_status === 'expiring') entry.expiring += 1;
      if (doc.expiry_status === 'expired') entry.expired += 1;
      if (doc.category_name) entry.categories.add(doc.category_name);
      const uploaded = doc.uploaded_at ? String(doc.uploaded_at) : '';
      if (uploaded > (entry.last_uploaded_at || '')) entry.last_uploaded_at = uploaded;
    }

    const data = [...byEmployee.values()]
      .map((entry) => ({ ...entry, categories: [...entry.categories] }))
      .sort((a, b) => b.total - a.total || String(a.employee_name).localeCompare(String(b.employee_name)));
    res.json({ data, totalEmployees: data.length, totalDocuments: documents.length });
  })
);

router.get(
  '/my',
  requireAnyPermission('documents.self', 'documents.view'),
  asyncHandler(async (req, res) => {
    if (!req.user.employeeId) return res.json({ data: [], pagination: { page: 1, limit: 15, total: 0, pages: 1 } });
    const documents = await listAllDocuments(
      req,
      {
        search: req.query.search,
        categoryId: req.query.categoryId || req.query.category_id,
        status: req.query.status,
        expiryStatus: req.query.expiryStatus || req.query.expiry_status,
        sort: req.query.sort,
      },
      { ownEmployeeId: req.user.employeeId }
    );
    res.json(paginate(documents, req.query));
  })
);

router.get(
  '/pending-verification',
  requirePermission('documents.view'),
  asyncHandler(async (req, res) => {
    const documents = await listAllDocuments(req, { ...req.query, status: 'pending' });
    res.json(paginate(documents, req.query));
  })
);

router.get(
  '/expiring',
  VIEW,
  asyncHandler(async (req, res) => {
    const documents = await listAllDocuments(req, { ...req.query, expiryStatus: 'expiring' }, {
      ownEmployeeId: ownOnly(req) ? req.user.employeeId || -1 : null,
    });
    res.json(paginate(documents, req.query));
  })
);

router.get(
  '/expired',
  VIEW,
  asyncHandler(async (req, res) => {
    const documents = await listAllDocuments(req, { ...req.query, expiryStatus: 'expired' }, {
      ownEmployeeId: ownOnly(req) ? req.user.employeeId || -1 : null,
    });
    res.json(paginate(documents, req.query));
  })
);

/* ------------------------------------------------------------------ */
/*  Missing documents                                                  */
/* ------------------------------------------------------------------ */
router.get(
  '/missing',
  requireAnyPermission('documents.view', 'documents.manage'),
  asyncHandler(async (req, res) => {
    const categories = await getCategoryMap();
    const documents = await listAllDocuments(req, {}, { categories });
    const missing = await computeMissingDocuments({ documents, categories });
    let rows = filterRows(missing.rows, req.query);
    if (String(req.query.onlyMissing || '') === '1') {
      rows = rows.filter((r) => r.status === 'missing' || r.status === 'rejected');
    }
    const counts = rows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
    res.json({
      ...paginate(rows, req.query),
      counts,
      summary: {
        requiredCategories: missing.required.length,
        completeEmployees: missing.completeCount,
        incompleteEmployees: missing.incompleteCount,
      },
      categories: missing.required,
      employees: missing.employees,
    });
  })
);

router.post(
  '/missing/remind',
  MANAGE,
  asyncHandler(async (req, res) => {
    const employeeId = Number(req.body?.employeeId);
    const categoryId = req.body?.categoryId ? Number(req.body.categoryId) : null;
    if (!employeeId) throw new ApiError(400, 'Choose an employee to remind.');

    const categories = await getCategoryMap();
    const category = categoryId ? categories.byId.get(categoryId) : null;
    if (categoryId && !category) throw new ApiError(404, 'Document category not found.');

    const documents = await listAllDocuments(req, {}, { categories });
    const missing = await computeMissingDocuments({ documents, categories });
    let rows = missing.rows.filter((r) => Number(r.employee_id) === employeeId);
    if (categoryId) rows = rows.filter((r) => Number(r.category_id) === categoryId);
    rows = rows.filter((r) => r.status === 'missing' || r.status === 'rejected');
    if (!rows.length) throw new ApiError(400, 'This employee has no outstanding required documents in that selection.');

    const today = isoDate();
    let sent = 0;
    for (const row of rows) {
      const dedupe = `doc-missing-${row.employee_id}-${row.category_id}-${today}`;
      const [result] = await pool.query(
        `INSERT IGNORE INTO document_reminder_history
           (employee_id, category_id, reminder_type, dedupe_key)
         VALUES (?,?,?,?)`,
        [row.employee_id, row.category_id, 'missing', dedupe]
      );
      if (!result.affectedRows) continue;
      sent += await notifyEmployee(row.employee_id, {
        title: 'Required document missing',
        message: `${row.category_name} is still required for your employee file. Please upload it from My Documents.`,
        path: '/documents/my',
        dedupeKey: dedupe,
      });
    }

    await audit(req, {
      action: 'documents.missing.remind',
      entity: 'employee_document',
      entityId: employeeId,
      details: { employeeId, categoryId, reminders: sent },
    });
    res.json({ message: sent ? `Reminder sent to the employee.` : 'A reminder was already sent today.', sent });
  })
);

router.post(
  '/reminders/run',
  MANAGE,
  asyncHandler(async (req, res) => {
    const result = await runDocumentReminders({ actorUserId: req.user.id });
    await audit(req, { action: 'documents.reminders.run', entity: 'employee_document', details: result });
    res.json({ message: 'Document reminders processed.', result });
  })
);

/* ------------------------------------------------------------------ */
/*  Reports                                                            */
/* ------------------------------------------------------------------ */
async function buildReport(req) {
  const categories = await getCategoryMap();
  const documents = await listAllDocuments(req, req.query, { categories });
  const missing = await computeMissingDocuments({ categories, documents: null });
  const byCategory = new Map();
  const byStatus = new Map();
  const byDepartment = new Map();
  for (const doc of documents) {
    const c = byCategory.get(doc.category_name) || { category: doc.category_name, group: doc.category_group, count: 0 };
    c.count += 1;
    byCategory.set(doc.category_name, c);
    byStatus.set(doc.status, (byStatus.get(doc.status) || 0) + 1);
    const d = byDepartment.get(doc.department_name || 'Unassigned') || { department: doc.department_name || 'Unassigned', count: 0 };
    d.count += 1;
    byDepartment.set(d.department_name || 'Unassigned', d);
  }
  return {
    summary: {
      total: documents.length,
      verified: documents.filter((d) => d.status === 'verified').length,
      pending: documents.filter((d) => d.status === 'pending').length,
      rejected: documents.filter((d) => d.status === 'rejected').length,
      expiring: documents.filter((d) => d.expiry_status === 'expiring').length,
      expired: documents.filter((d) => d.expiry_status === 'expired').length,
      missing: missing.rows.filter((r) => r.status === 'missing' || r.status === 'rejected').length,
      completeEmployees: missing.completeCount,
      incompleteEmployees: missing.incompleteCount,
    },
    byCategory: [...byCategory.values()].sort((a, b) => b.count - a.count),
    byStatus: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
    byDepartment: [...byDepartment.values()].sort((a, b) => b.count - a.count),
    expiring: documents.filter((d) => d.expiry_status === 'expiring'),
    expired: documents.filter((d) => d.expiry_status === 'expired'),
    rejected: documents.filter((d) => d.status === 'rejected'),
    missingRows: missing.rows.filter((r) => r.status === 'missing' || r.status === 'rejected'),
    documents,
    missing,
  };
}

router.get(
  '/reports',
  REPORTS,
  asyncHandler(async (req, res) => {
    const report = await buildReport(req);
    res.json({
      summary: report.summary,
      byCategory: report.byCategory,
      byStatus: report.byStatus,
      byDepartment: report.byDepartment,
      expiring: report.expiring.slice(0, 25),
      expired: report.expired.slice(0, 25),
      rejected: report.rejected.slice(0, 25),
      missing: report.missingRows.slice(0, 25),
    });
  })
);

router.get(
  '/reports/export',
  REPORTS,
  asyncHandler(async (req, res) => {
    const report = await buildReport(req);
    const type = String(req.query.type || 'documents');
    let csv;
    if (type === 'missing') {
      csv = toCsv(
        ['Employee', 'Employee ID', 'Department', 'Required Document', 'Status', 'Last Reminder'],
        report.missingRows.map((r) => [r.employee_name, r.employee_code, r.department_name, r.category_name, r.status, r.last_reminder || ''])
      );
    } else if (type === 'expiring') {
      csv = toCsv(
        ['Employee', 'Employee ID', 'Department', 'Document', 'Category', 'Expiry Date', 'Days Remaining', 'Status'],
        [...report.expiring, ...report.expired].map((d) => [
          d.employee_name, d.employee_code, d.department_name, d.name, d.category_name,
          d.expiry_date, d.days_remaining, d.expiry_label,
        ])
      );
    } else {
      csv = toCsv(
        ['Document ID', 'Employee', 'Employee ID', 'Department', 'Document', 'Category', 'Document Number', 'Upload Date', 'Expiry Date', 'Verification Status', 'Source'],
        report.documents.map((d) => [
          d.document_number || d.uid, d.employee_name, d.employee_code, d.department_name, d.name,
          d.category_name, d.document_number_value || '', d.uploaded_at, d.expiry_date || '',
          d.status, d.source_label,
        ])
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kodewar-documents-${type}.csv"`);
    res.send(`\uFEFF${csv}`);
  })
);

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */
const SETTING_KEYS = new Set(Object.keys({
  documents_enabled: 1, default_requires_verification: 1, max_upload_mb: 1,
  allowed_extensions: 1, expiry_warning_days: 1, expiry_reminder_days: 1,
  notify_employee: 1, notify_hr: 1, missing_document_reminders: 1, retention_years: 1,
}));
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx']);

router.get(
  '/settings',
  requirePermission('documents.settings'),
  asyncHandler(async (req, res) => {
    res.json({ settings: await getDocumentSettings() });
  })
);

router.put(
  '/settings',
  SETTINGS,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const updates = [];
    for (const [key, raw] of Object.entries(body)) {
      if (!SETTING_KEYS.has(key)) continue;
      let value = raw;
      if (['documents_enabled', 'default_requires_verification', 'notify_employee', 'notify_hr', 'missing_document_reminders'].includes(key)) {
        value = raw === true || raw === 1 || raw === '1' || raw === 'true' ? '1' : '0';
      } else if (key === 'max_upload_mb') {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 1 || n > 25) throw new ApiError(400, 'Maximum upload size must be between 1 and 25 MB.');
        value = String(Math.round(n));
      } else if (key === 'expiry_warning_days') {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0 || n > 365) throw new ApiError(400, 'Expiry warning period must be between 0 and 365 days.');
        value = String(n);
      } else if (key === 'retention_years') {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1 || n > 50) throw new ApiError(400, 'Retention must be between 1 and 50 years.');
        value = String(n);
      } else if (key === 'expiry_reminder_days') {
        const days = String(raw)
          .split(',')
          .map((x) => Number(x.trim()))
          .filter((n) => Number.isInteger(n) && n >= 0 && n <= 365);
        if (!days.length) throw new ApiError(400, 'Add at least one valid reminder interval.');
        value = [...new Set(days)].sort((a, b) => b - a).join(',');
      } else if (key === 'allowed_extensions') {
        const list = String(raw)
          .split(',')
          .map((x) => x.trim().toLowerCase().replace(/^\./, ''))
          .filter(Boolean);
        const invalid = list.filter((x) => !ALLOWED_EXTENSIONS.has(x));
        if (!list.length || invalid.length) throw new ApiError(400, 'Allowed formats must be a subset of pdf, jpg, jpeg, png, doc, docx.');
        value = [...new Set(list)].join(',');
      } else {
        value = String(raw);
      }
      updates.push([key, value]);
    }
    if (!updates.length) throw new ApiError(400, 'No valid settings supplied.');

    for (const [key, value] of updates) {
      await pool.query(
        `INSERT INTO document_settings (setting_key, setting_value, updated_by)
         VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
        [key, value, req.user.id]
      );
    }
    await audit(req, { action: 'documents.settings.update', entity: 'document_settings', details: { keys: updates.map(([k]) => k) } });
    res.json({ message: 'Document settings saved.', settings: await getDocumentSettings() });
  })
);

/* ------------------------------------------------------------------ */
/*  Categories                                                         */
/* ------------------------------------------------------------------ */
router.get(
  '/categories',
  requireAnyPermission('documents.view', 'documents.self', 'documents.manage', 'documents.categories.manage'),
  asyncHandler(async (req, res) => {
    const canSeeAll =
      req.permissions.includes('documents.categories.manage') || req.permissions.includes('documents.manage');
    const all = String(req.query.all || '') === '1' && canSeeAll;
    const [rows] = await pool.query(
      `SELECT c.*, (SELECT COUNT(*) FROM employee_documents d WHERE d.category_id = c.id) AS document_count
       FROM document_categories c
       ${all ? '' : 'WHERE c.is_active = 1'}
       ORDER BY c.sort_order ASC, c.name ASC`
    );
    res.json({ data: rows });
  })
);

function categoryPayload(body) {
  const name = cleanText(body.name, 120);
  if (!name) throw new ApiError(400, 'Category name is required.');
  const slug = (cleanText(body.slug, 120) || name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
  if (!slug) throw new ApiError(400, 'Category slug is required.');
  const group = cleanText(body.group || body.group_name, 60) || 'Other Documents';
  return {
    name,
    slug,
    group_name: group,
    description: cleanText(body.description, 400),
    is_required: body.isRequired ?? body.is_required ? 1 : 0,
    requires_expiry: body.requiresExpiry ?? body.requires_expiry ? 1 : 0,
    employee_uploads: body.employeeUploads ?? body.employee_uploads ? 1 : 0,
    requires_verification: body.requiresVerification ?? body.requires_verification ? 1 : 0,
    is_active: body.isActive ?? body.is_active ?? true ? 1 : 0,
    sort_order: Number(body.sortOrder ?? body.sort_order) || 0,
  };
}

router.post(
  '/categories',
  CATEGORIES,
  asyncHandler(async (req, res) => {
    const data = categoryPayload(req.body);
    try {
      const [result] = await pool.query(
        `INSERT INTO document_categories
           (name, slug, group_name, description, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [data.name, data.slug, data.group_name, data.description, data.is_required, data.requires_expiry, data.employee_uploads, data.requires_verification, data.is_active, data.sort_order, req.user.id]
      );
      await audit(req, { action: 'documents.category.create', entity: 'document_category', entityId: result.insertId, details: { name: data.name } });
      res.status(201).json({ id: result.insertId, message: 'Document category created.' });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'A category with that name or slug already exists.');
      throw err;
    }
  })
);

router.put(
  '/categories/:id',
  CATEGORIES,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [[existing]] = await pool.query('SELECT * FROM document_categories WHERE id = ?', [id]);
    if (!existing) throw new ApiError(404, 'Document category not found.');
    const data = categoryPayload({ ...existing, ...req.body });
    try {
      await pool.query(
        `UPDATE document_categories SET
           name = ?, slug = ?, group_name = ?, description = ?, is_required = ?, requires_expiry = ?,
           employee_uploads = ?, requires_verification = ?, is_active = ?, sort_order = ?
         WHERE id = ?`,
        [data.name, data.slug, data.group_name, data.description, data.is_required, data.requires_expiry, data.employee_uploads, data.requires_verification, data.is_active, data.sort_order, id]
      );
      await audit(req, { action: 'documents.category.update', entity: 'document_category', entityId: id, details: { name: data.name } });
      res.json({ message: 'Document category updated.' });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'A category with that name or slug already exists.');
      throw err;
    }
  })
);

router.delete(
  '/categories/:id',
  CATEGORIES,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [[row]] = await pool.query(
      `SELECT c.id,
              (SELECT COUNT(*) FROM employee_documents d WHERE d.category_id = c.id) AS document_count
       FROM document_categories c WHERE c.id = ?`,
      [id]
    );
    if (!row) throw new ApiError(404, 'Document category not found.');
    if (Number(row.document_count) > 0) {
      throw new ApiError(409, 'This category is already used by employee documents. Deactivate it instead.');
    }
    await pool.query('DELETE FROM document_categories WHERE id = ?', [id]);
    await audit(req, { action: 'documents.category.delete', entity: 'document_category', entityId: id });
    res.json({ message: 'Document category deleted.' });
  })
);

/* ------------------------------------------------------------------ */
/*  Employee profile summary                                           */
/* ------------------------------------------------------------------ */
router.get(
  '/employee/:employeeId/summary',
  VIEW,
  asyncHandler(async (req, res) => {
    const employeeId = Number(req.params.employeeId);
    if (!Number.isInteger(employeeId) || employeeId <= 0) throw new ApiError(400, 'Invalid employee ID.');
    if (ownOnly(req) && Number(req.user.employeeId) !== employeeId) {
      throw new ApiError(403, 'You can only view your own documents.');
    }
    const categories = await getCategoryMap();
    const documents = await listAllDocuments(req, { employeeId }, { categories });
    const missing = await computeMissingDocuments({ categories, documents: null, ownEmployeeId: employeeId });
    const rows = missing.rows;
    res.json({
      documents,
      summary: {
        total: documents.length,
        verified: documents.filter((d) => d.status === 'verified').length,
        pending: documents.filter((d) => d.status === 'pending').length,
        rejected: documents.filter((d) => d.status === 'rejected').length,
        expired: documents.filter((d) => d.expiry_status === 'expired').length,
        expiringSoon: documents.filter((d) => d.expiry_status === 'expiring').length,
        missing: rows.filter((r) => r.status === 'missing' || r.status === 'rejected').length,
        complete: missing.completeCount === 1,
      },
      required: rows,
    });
  })
);

/* ------------------------------------------------------------------ */
/*  Single document: read, preview, download                           */
/* ------------------------------------------------------------------ */
router.get(
  '/:id',
  VIEW,
  asyncHandler(async (req, res) => {
    const doc = await loadDocumentByIdentity(req, req.params.id);
    if (!doc) throw new ApiError(404, 'Document not found.');
    assertView(req, doc);

    let verificationHistory = [];
    let activity = [];
    if (doc.source === 'documents') {
      const [history] = await pool.query(
        `SELECT h.*, u.name AS performed_by_name
         FROM document_verification_history h LEFT JOIN hrm_users u ON u.id = h.performed_by
         WHERE h.document_id = ? ORDER BY h.created_at DESC, h.id DESC`,
        [doc.id]
      );
      verificationHistory = history;
      const [logs] = await pool.query(
        `SELECT a.*, u.name AS performed_by_name
         FROM document_activity_history a LEFT JOIN hrm_users u ON u.id = a.performed_by
         WHERE a.document_id = ? OR (a.employee_id = ? AND a.document_id IS NULL)
         ORDER BY a.created_at DESC, a.id DESC LIMIT 100`,
        [doc.id, doc.employee_id]
      );
      activity = logs;
    } else {
      const [logs] = await pool.query(
        `SELECT a.*, u.name AS performed_by_name
         FROM document_activity_history a LEFT JOIN hrm_users u ON u.id = a.performed_by
         WHERE a.employee_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 50`,
        [doc.employee_id]
      );
      activity = logs;
    }
    res.json({ document: doc, verificationHistory, activity });
  })
);

async function fetchRawForFile(doc) {
  if (doc.source === 'onboarding') {
    const [[row]] = await pool.query(
      'SELECT file_path, original_filename, mime_type FROM onboarding_documents WHERE id = ?',
      [doc.id]
    );
    return row || null;
  }
  if (doc.source === 'exit') {
    const [[row]] = await pool.query(
      `SELECT eed.*, e.first_name, e.last_name, e.employee_code, e.join_date, e.designation,
              d.name AS department_name, er.approved_last_working_day
       FROM employee_exit_documents eed
       JOIN hrm_employees e ON e.id = eed.employee_id
       LEFT JOIN hrm_departments d ON d.id = e.department_id
       LEFT JOIN employee_resignations er ON er.id = eed.resignation_id
       WHERE eed.id = ?`,
      [doc.id]
    );
    return row || null;
  }
  return null;
}

async function sendDocumentFile(req, res, { inline }) {
  const doc = await loadDocumentByIdentity(req, req.params.id);
  if (!doc) throw new ApiError(404, 'Document not found.');
  assertView(req, doc);

  if (!inline) {
    await audit(req, {
      action: 'documents.download',
      entity: doc.source === 'documents' ? 'employee_document' : doc.source === 'onboarding' ? 'onboarding_document' : 'employee_exit_document',
      entityId: doc.id,
      details: { employeeId: doc.employee_id, name: doc.name, source: doc.source_label },
    });
  }

  const disposition = inline ? 'inline' : 'attachment';
  const safeName = String(doc.file_name || 'document').replace(/["\r\n]/g, '_');

  if (doc.source === 'exit') {
    const row = await fetchRawForFile(doc);
    if (!row) throw new ApiError(404, 'Exit document not found.');
    const pdf = await generateExitDocPdf(row);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${row.document_number || 'exit-document'}.pdf"`);
    return res.send(pdf);
  }

  if (doc.source === 'onboarding') {
    const row = await fetchRawForFile(doc);
    if (!row) throw new ApiError(404, 'Onboarding document not found.');
    const fullPath = getDocPath(row.file_path);
    if (!fs.existsSync(fullPath)) throw new ApiError(404, 'The document file is no longer available.');
    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(row.original_filename)}"`);
    return res.sendFile(fullPath);
  }

  const stored = await getDocumentStream({
    provider: doc.storage_provider,
    key: doc.storage_key,
    fileId: doc.storage_file_id,
  });
  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(safeName)}"`);
  if (stored.type === 'file') return res.sendFile(stored.path);
  return Readable.fromWeb(stored.response.body).pipe(res);
}

router.get('/:id/preview', VIEW, asyncHandler((req, res) => sendDocumentFile(req, res, { inline: true })));
router.get('/:id/download', VIEW, asyncHandler((req, res) => sendDocumentFile(req, res, { inline: false })));

/* ------------------------------------------------------------------ */
/*  Upload / update / replace / delete                                 */
/* ------------------------------------------------------------------ */
function assertUploadAllowed(req, targetEmployeeId) {
  if (!req.permissions.includes('documents.manage') && Number(req.user.employeeId) !== Number(targetEmployeeId)) {
    throw new ApiError(403, 'You can only upload documents for your own employee record.');
  }
}

async function resolveUploadContext(req) {
  const settings = await getDocumentSettings();
  assertDocumentEnabled(settings);
  const targetEmployeeId = Number(req.body?.employeeId || req.body?.employee_id || req.user.employeeId);
  if (!Number.isInteger(targetEmployeeId) || targetEmployeeId <= 0) {
    throw new ApiError(400, 'Choose the employee this document belongs to.');
  }
  assertUploadAllowed(req, targetEmployeeId);

  const [[employee]] = await pool.query(
    `SELECT id, department_id, CONCAT(first_name, ' ', last_name) AS name, status
     FROM hrm_employees WHERE id = ? LIMIT 1`,
    [targetEmployeeId]
  );
  if (!employee) throw new ApiError(404, 'Employee not found.');

  const categoryId = Number(req.body?.categoryId || req.body?.category_id);
  const [[category]] = await pool.query('SELECT * FROM document_categories WHERE id = ? LIMIT 1', [categoryId]);
  if (!category) throw new ApiError(400, 'Choose a document category.');
  if (!Number(category.is_active)) throw new ApiError(400, 'That document category is inactive.');

  const isSelf = Number(req.user.employeeId) === targetEmployeeId;
  if (isSelf && !Number(category.employee_uploads) && !req.permissions.includes('documents.manage')) {
    throw new ApiError(403, 'This document type is managed by HR. Please contact your HR team.');
  }

  if (!req.file) throw new ApiError(400, 'Please select a document file to upload.');
  validateDocumentContent(req.file);
  const maxMb = Number(settings.max_upload_mb) || 15;
  if (req.file.size > maxMb * 1024 * 1024) throw new ApiError(400, `File must be ${maxMb} MB or smaller.`);
  const ext = String(req.file.originalname).split('.').pop()?.toLowerCase();
  const allowed = String(settings.allowed_extensions || 'pdf,jpg,jpeg,png,doc,docx').split(',').map((x) => x.trim());
  if (ext && !allowed.includes(ext)) throw new ApiError(400, `Allowed formats: ${allowed.join(', ').toUpperCase()}.`);

  return { settings, employee, category, targetEmployeeId };
}

async function storeFile(req, category) {
  const key = buildStorageKey(req.file.originalname, normalizedMime(req.file));
  const stored = await putDocument(req.file.buffer, { key, mimeType: normalizedMime(req.file) });
  return {
    ...stored,
    originalName: safeOriginalName(req.file.originalname),
    mimeType: normalizedMime(req.file),
    size: req.file.size,
    hash: documentHash(req.file.buffer),
  };
}

router.post(
  '/',
  requireAnyPermission('documents.self', 'documents.manage'),
  uploadDocumentMiddleware,
  asyncHandler(async (req, res) => {
    const { settings, employee, category, targetEmployeeId } = await resolveUploadContext(req);
    const file = await storeFile(req, category);
    const name = cleanText(req.body?.name, 200) || file.originalName;
    const requiresVerification = Number(category.requires_verification) === 1;
    const status = requiresVerification ? 'pending' : 'verified';

    let insertId;
    try {
      const documentNumber = await nextDocumentNumber(pool);
      const [result] = await pool.query(
        `INSERT INTO employee_documents
           (document_number, employee_id, department_id, category_id, name, document_number_value,
            issue_date, expiry_date, description, status, verification_notes, storage_provider, storage_key,
            storage_file_id, file_name, file_size, mime_type, file_hash, uploaded_by, verified_by, verified_at, source)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'upload')`,
        [
          documentNumber,
          targetEmployeeId,
          employee.department_id || null,
          category.id,
          name,
          cleanText(req.body?.documentNumber || req.body?.document_number_value, 120),
          parseDate(req.body?.issueDate || req.body?.issue_date, 'issue date'),
          parseDate(req.body?.expiryDate || req.body?.expiry_date, 'expiry date'),
          cleanText(req.body?.description, 2000),
          status,
          requiresVerification ? null : 'No verification required for this category.',
          file.provider,
          file.key,
          file.fileId,
          file.originalName,
          file.size,
          file.mimeType,
          file.hash,
          req.user.id,
          requiresVerification ? null : req.user.id,
          requiresVerification ? null : new Date(),
        ]
      );
      insertId = result.insertId;
    } catch (err) {
      await deleteDocumentFile({ provider: file.provider, key: file.key, fileId: file.fileId });
      throw err;
    }

    await logVerification(pool, {
      documentId: insertId,
      action: 'submitted',
      status,
      userId: req.user.id,
    });
    await logActivity(pool, {
      documentId: insertId,
      employeeId: targetEmployeeId,
      action: 'document.uploaded',
      details: { name, category: category.name, source: 'document_management' },
      userId: req.user.id,
    });

    if (requiresVerification) {
      await notifyDocumentVerifiers({
        title: 'New document pending verification',
        message: `${employee.name} uploaded ${name} (${category.name}).`,
        path: '/documents/pending-verification',
        dedupeKey: `doc-pending-${insertId}`,
      });
    }
    await audit(req, {
      action: 'documents.upload',
      entity: 'employee_document',
      entityId: insertId,
      details: { employeeId: targetEmployeeId, name, category: category.name, status },
    });

    const doc = await loadDocumentByIdentity(req, insertId);
    res.status(201).json({
      document: doc,
      message: requiresVerification ? 'Document uploaded and sent for verification.' : 'Document uploaded successfully.',
    });
  })
);

router.put(
  '/:id',
  requireAnyPermission('documents.self', 'documents.manage'),
  asyncHandler(async (req, res) => {
    const doc = await loadDocumentByIdentity(req, req.params.id);
    if (!doc) throw new ApiError(404, 'Document not found.');
    assertManageOrOwner(req, doc);
    if (doc.source !== 'documents') throw new ApiError(400, 'This document is managed by its source module and cannot be edited here.');
    if (!req.permissions.includes('documents.manage') && doc.status === 'verified') {
      throw new ApiError(400, 'Verified documents cannot be edited. Contact HR if a change is required.');
    }
    const name = cleanText(req.body?.name, 200) || doc.name;
    const documentNumberValue = req.body?.documentNumber === undefined && req.body?.document_number_value === undefined
      ? doc.document_number_value
      : cleanText(req.body?.documentNumber ?? req.body?.document_number_value, 120);
    const issueDate = req.body?.issueDate === undefined && req.body?.issue_date === undefined
      ? doc.issue_date
      : parseDate(req.body?.issueDate ?? req.body?.issue_date, 'issue date');
    const expiryDate = req.body?.expiryDate === undefined && req.body?.expiry_date === undefined
      ? doc.expiry_date
      : parseDate(req.body?.expiryDate ?? req.body?.expiry_date, 'expiry date');
    if (issueDate && expiryDate && expiryDate < issueDate) {
      throw new ApiError(400, 'Expiry date cannot be before the issue date.');
    }
    await pool.query(
      `UPDATE employee_documents
       SET name = ?, document_number_value = ?, issue_date = ?, expiry_date = ?, description = ?
       WHERE id = ?`,
      [name, documentNumberValue, issueDate, expiryDate, cleanText(req.body?.description, 2000), doc.id]
    );
    await logActivity(pool, {
      documentId: doc.id,
      employeeId: doc.employee_id,
      action: 'document.metadata_changed',
      details: { name },
      userId: req.user.id,
    });
    await audit(req, { action: 'documents.update', entity: 'employee_document', entityId: doc.id, details: { name } });
    res.json({ message: 'Document details updated.', document: await loadDocumentByIdentity(req, doc.id) });
  })
);

router.post(
  '/:id/replace',
  requireAnyPermission('documents.self', 'documents.manage'),
  uploadDocumentMiddleware,
  asyncHandler(async (req, res) => {
    const doc = await loadDocumentByIdentity(req, req.params.id);
    if (!doc) throw new ApiError(404, 'Document not found.');
    assertManageOrOwner(req, doc);
    if (doc.source !== 'documents') {
      throw new ApiError(400, 'This document can only be replaced from its original module.');
    }
    // A replacement always targets the document's own employee and category.
    req.body.employeeId = doc.employee_id;
    if (!req.body.categoryId && !req.body.category_id) req.body.categoryId = doc.category_id;
    const { employee, category } = await resolveUploadContext(req);
    if (Number(category.id) !== Number(doc.category_id) && !req.permissions.includes('documents.manage')) {
      throw new ApiError(400, 'A replacement must use the same document category.');
    }
    const file = await storeFile(req, category);
    const requiresVerification = Number(category.requires_verification) === 1;
    const status = requiresVerification ? 'pending' : 'verified';

    try {
      await pool.query(
        `UPDATE employee_documents SET
           category_id = ?, name = ?, document_number_value = ?, issue_date = ?, expiry_date = ?, description = ?,
           status = ?, verification_notes = ?, rejection_reason = NULL,
           storage_provider = ?, storage_key = ?, storage_file_id = ?, file_name = ?, file_size = ?, mime_type = ?, file_hash = ?,
           uploaded_by = ?, verified_by = ?, verified_at = ?
         WHERE id = ?`,
        [
          category.id,
          cleanText(req.body?.name, 200) || doc.name,
          cleanText(req.body?.documentNumber || req.body?.document_number_value, 120) || doc.document_number_value,
          parseDate(req.body?.issueDate || req.body?.issue_date, 'issue date') || doc.issue_date,
          parseDate(req.body?.expiryDate || req.body?.expiry_date, 'expiry date') || doc.expiry_date,
          cleanText(req.body?.description, 2000) ?? doc.description,
          status,
          requiresVerification ? null : 'No verification required for this category.',
          file.provider,
          file.key,
          file.fileId,
          file.originalName,
          file.size,
          file.mimeType,
          file.hash,
          req.user.id,
          requiresVerification ? null : req.user.id,
          requiresVerification ? null : new Date(),
          doc.id,
        ]
      );
    } catch (err) {
      await deleteDocumentFile({ provider: file.provider, key: file.key, fileId: file.fileId });
      throw err;
    }

    await deleteDocumentFile({ provider: doc.storage_provider, key: doc.storage_key, fileId: doc.storage_file_id });
    await logVerification(pool, {
      documentId: doc.id,
      action: 'replaced',
      status,
      userId: req.user.id,
    });
    await logActivity(pool, {
      documentId: doc.id,
      employeeId: employee.id,
      action: 'document.replaced',
      details: { name: doc.name, file: file.originalName },
      userId: req.user.id,
    });
    if (requiresVerification) {
      await notifyDocumentVerifiers({
        title: 'Document replaced and pending verification',
        message: `${employee.name} replaced ${doc.name} (${category.name}).`,
        path: '/documents/pending-verification',
        dedupeKey: `doc-replaced-${doc.id}-${Date.now()}`,
      });
    }
    await audit(req, { action: 'documents.replace', entity: 'employee_document', entityId: doc.id, details: { name: doc.name } });
    res.json({ message: 'Document replaced successfully.', document: await loadDocumentByIdentity(req, doc.id) });
  })
);

router.delete(
  '/:id',
  MANAGE,
  asyncHandler(async (req, res) => {
    const doc = await loadDocumentByIdentity(req, req.params.id);
    if (!doc) throw new ApiError(404, 'Document not found.');
    if (doc.source !== 'documents') throw new ApiError(400, 'This document is managed by its source module and cannot be deleted here.');
    await deleteDocumentFile({ provider: doc.storage_provider, key: doc.storage_key, fileId: doc.storage_file_id });
    await pool.query('DELETE FROM employee_documents WHERE id = ?', [doc.id]);
    await logActivity(pool, {
      documentId: null,
      employeeId: doc.employee_id,
      action: 'document.deleted',
      details: { name: doc.name, category: doc.category_name, source: doc.source_label },
      userId: req.user.id,
    });
    await audit(req, { action: 'documents.delete', entity: 'employee_document', entityId: doc.id, details: { name: doc.name } });
    res.json({ message: 'Document deleted.' });
  })
);

/* ------------------------------------------------------------------ */
/*  Verification                                                       */
/* ------------------------------------------------------------------ */
async function verifyDocument(req, res, { reject }) {
  const doc = await loadDocumentByIdentity(req, req.params.id);
  if (!doc) throw new ApiError(404, 'Document not found.');
  if (doc.source === 'exit') throw new ApiError(400, 'Generated exit documents do not require verification.');
  if (isOwner(req, doc)) throw new ApiError(403, 'You cannot verify your own document.');

  const rejectionReason = reject ? cleanText(req.body?.rejectionReason || req.body?.rejection_reason, 2000) : null;
  const notes = cleanText(req.body?.notes, 2000);
  if (reject && !rejectionReason) throw new ApiError(400, 'A rejection reason is required.');

  const status = reject ? 'rejected' : 'verified';

  if (doc.source === 'documents') {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE employee_documents
         SET status = ?, verified_by = ?, verified_at = NOW(), verification_notes = ?, rejection_reason = ?
         WHERE id = ?`,
        [status, req.user.id, notes, reject ? rejectionReason : null, doc.id]
      );
      await logVerification(conn, {
        documentId: doc.id,
        action: reject ? 'rejected' : 'verified',
        status,
        notes,
        rejectionReason: reject ? rejectionReason : null,
        userId: req.user.id,
      });
      await logActivity(conn, {
        documentId: doc.id,
        employeeId: doc.employee_id,
        action: reject ? 'document.rejected' : 'document.verified',
        details: { name: doc.name, rejectionReason: reject ? rejectionReason : undefined },
        userId: req.user.id,
      });
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } else {
    await pool.query(
      `UPDATE onboarding_documents
       SET status = ?, rejection_reason = ?, verified_by = ?, verified_at = NOW()
       WHERE id = ?`,
      [status, reject ? rejectionReason : null, req.user.id, doc.id]
    );
    const [[full]] = await pool.query('SELECT task_id FROM onboarding_documents WHERE id = ?', [doc.id]);
    if (full?.task_id) {
      await pool.query(
        `UPDATE onboarding_tasks
         SET status = ?, verified_by = ?, verified_at = NOW(), rejection_reason = ?
         WHERE id = ?`,
        [reject ? 'rejected' : 'completed', req.user.id, reject ? rejectionReason : null, full.task_id]
      );
    }
    await logActivity(pool, {
      documentId: null,
      employeeId: doc.employee_id,
      action: reject ? 'onboarding_document.rejected' : 'onboarding_document.verified',
      details: { name: doc.name, source: 'Onboarding', rejectionReason: reject ? rejectionReason : undefined },
      userId: req.user.id,
    });
  }

  await notifyEmployee(doc.employee_id, {
    title: reject ? 'Document rejected' : 'Document verified',
    message: reject
      ? `${doc.name} was rejected: ${rejectionReason}`
      : `${doc.name} has been verified by HR.`,
    path: '/documents/my',
    dedupeKey: `doc-${status}-${doc.uid}-${Date.now()}`,
  });

  await audit(req, {
    action: reject ? 'documents.reject' : 'documents.verify',
    entity: doc.source === 'documents' ? 'employee_document' : 'onboarding_document',
    entityId: doc.id,
    details: { name: doc.name, employeeId: doc.employee_id, status },
  });

  res.json({ message: `Document marked as ${status}.`, document: await loadDocumentByIdentity(req, doc.uid) });
}

router.post('/:id/verify', VERIFY, asyncHandler((req, res) => verifyDocument(req, res, { reject: false })));
router.post('/:id/reject', VERIFY, asyncHandler((req, res) => verifyDocument(req, res, { reject: true })));

export default router;

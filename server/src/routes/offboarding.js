import { Router } from 'express';
import pool from '../db.js';
import { asyncHandler, ApiError } from '../utils.js';
import { authenticate, requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { audit } from '../audit.js';
import { generateExitDocPdf } from '../services/pdf.js';

const router = Router();
router.use(authenticate);

const VIEW = requireAnyPermission('offboarding.view', 'offboarding.manage', 'offboarding.self');
const MANAGE = requirePermission('offboarding.manage');

/**
 * Resignations Dashboard & List
 */
router.get(
  '/resignations',
  VIEW,
  asyncHandler(async (req, res) => {
    let whereClause = '';
    const params = [];

    if (req.user.role === 'employee') {
      if (!req.user.employeeId) return res.json({ resignations: [] });
      whereClause = 'WHERE er.employee_id = ?';
      params.push(req.user.employeeId);
    } else if (req.query.status) {
      whereClause = 'WHERE er.status = ?';
      params.push(req.query.status);
    }

    const [resignations] = await pool.query(`
      SELECT er.*,
        e.first_name, e.last_name, e.employee_code, e.email AS employee_email, e.join_date,
        d.name AS department_name,
        npr.notice_duration_days, npr.expected_lwd, npr.status AS notice_status,
        rev.name AS reviewed_by_name
      FROM employee_resignations er
      JOIN hrm_employees e ON e.id = er.employee_id
      LEFT JOIN hrm_departments d ON d.id = e.department_id
      LEFT JOIN notice_period_records npr ON npr.resignation_id = er.id
      LEFT JOIN hrm_users rev ON rev.id = er.reviewed_by
      ${whereClause}
      ORDER BY er.created_at DESC
    `, params);

    res.json({ resignations });
  })
);

/**
 * Submit Resignation (Employee Self-Service or HR)
 */
router.post(
  '/resignations',
  VIEW,
  asyncHandler(async (req, res) => {
    const { employee_id, resignation_date, proposed_last_working_day, reason, comments, notice_days } = req.body;

    const targetEmpId = req.user.role === 'employee' ? req.user.employeeId : (employee_id || req.user.employeeId);
    if (!targetEmpId) throw new ApiError(400, 'Employee ID is required.');
    if (!resignation_date || !proposed_last_working_day || !reason) {
      throw new ApiError(400, 'Resignation date, proposed last day, and reason are required.');
    }

    // Check if active resignation exists
    const [[active]] = await pool.query(`
      SELECT id FROM employee_resignations
      WHERE employee_id = ? AND status IN ('pending','under_review','clarification_requested','approved')
    `, [targetEmpId]);
    if (active) throw new ApiError(409, 'An active resignation request already exists for this employee.');

    const noticeDuration = Number(notice_days) || 30; // Configurable notice period rule
    const expDate = new Date(resignation_date);
    expDate.setDate(expDate.getDate() + noticeDuration);
    const expectedLwd = expDate.toISOString().slice(0, 10);

    const [resResult] = await pool.query(`
      INSERT INTO employee_resignations
        (employee_id, resignation_date, proposed_last_working_day, reason, comments, status)
      VALUES (?,?,?,?,?,'pending')
    `, [targetEmpId, resignation_date, proposed_last_working_day, reason, comments || null]);

    const resignationId = resResult.insertId;

    // Create Notice Period Record
    await pool.query(`
      INSERT INTO notice_period_records
        (resignation_id, employee_id, notice_duration_days, submission_date, expected_lwd, status)
      VALUES (?,?,?,?,?,'serving')
    `, [resignationId, targetEmpId, noticeDuration, resignation_date, expectedLwd]);

    await audit(req, {
      action: 'offboarding.resignation.submit',
      entity: 'employee_resignation',
      entityId: resignationId,
      details: { employee_id: targetEmpId, proposed_lwd: proposed_last_working_day },
    });

    res.status(201).json({
      id: resignationId,
      message: 'Resignation submitted successfully. Notice period record initiated.',
    });
  })
);

/**
 * Review / Approve / Reject Resignation (HR / Super Admin)
 */
router.patch(
  '/resignations/:id/review',
  MANAGE,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { status, approved_last_working_day, clarification_notes } = req.body;

    if (!['under_review', 'clarification_requested', 'approved', 'rejected'].includes(status)) {
      throw new ApiError(400, 'Invalid resignation status review action.');
    }

    const [[resignation]] = await pool.query('SELECT * FROM employee_resignations WHERE id = ?', [id]);
    if (!resignation) throw new ApiError(404, 'Resignation request not found.');

    const finalLwd = status === 'approved' ? (approved_last_working_day || resignation.proposed_last_working_day) : null;

    await pool.query(`
      UPDATE employee_resignations
      SET status = ?, approved_last_working_day = ?, clarification_notes = ?,
          reviewed_by = ?, reviewed_at = NOW()
      WHERE id = ?
    `, [status, finalLwd, clarification_notes || null, req.user.id, id]);

    // Update notice period status
    if (status === 'approved') {
      await pool.query(`
        UPDATE notice_period_records
        SET approved_lwd = ?, status = 'serving'
        WHERE resignation_id = ?
      `, [finalLwd, id]);

      // If approved last working day is today or past, mark employee inactive
      if (new Date(finalLwd) <= new Date()) {
        await pool.query("UPDATE hrm_employees SET status = 'inactive' WHERE id = ?", [resignation.employee_id]);
      }
    } else if (status === 'rejected') {
      await pool.query("UPDATE notice_period_records SET status = 'waived' WHERE resignation_id = ?", [id]);
    }

    await audit(req, {
      action: 'offboarding.resignation.review',
      entity: 'employee_resignation',
      entityId: id,
      details: { status, approved_lwd: finalLwd },
    });

    res.json({ message: `Resignation request marked as ${status}.` });
  })
);

/**
 * Notice Period Management List
 */
router.get(
  '/notice-periods',
  VIEW,
  asyncHandler(async (req, res) => {
    let whereClause = '';
    const params = [];

    if (req.user.role === 'employee') {
      if (!req.user.employeeId) return res.json({ noticePeriods: [] });
      whereClause = 'WHERE npr.employee_id = ?';
      params.push(req.user.employeeId);
    }

    const [rows] = await pool.query(`
      SELECT npr.*,
        e.first_name, e.last_name, e.employee_code, e.email AS employee_email, e.designation,
        d.name AS department_name,
        er.resignation_date, er.reason, er.status AS resignation_status
      FROM notice_period_records npr
      JOIN hrm_employees e ON e.id = npr.employee_id
      JOIN employee_resignations er ON er.id = npr.resignation_id
      LEFT JOIN hrm_departments d ON d.id = e.department_id
      ${whereClause}
      ORDER BY npr.expected_lwd ASC
    `, params);

    // Calculate remaining days dynamically
    const today = new Date().toISOString().slice(0, 10);
    const noticePeriods = rows.map((r) => {
      const targetLwd = r.approved_lwd || r.expected_lwd;
      const msDiff = new Date(targetLwd).getTime() - new Date(today).getTime();
      const remainingDays = Math.max(0, Math.ceil(msDiff / (1000 * 60 * 60 * 24)));
      return {
        ...r,
        remaining_days: remainingDays,
      };
    });

    res.json({ noticePeriods });
  })
);

/**
 * Exit Documents List
 */
router.get(
  '/exit-documents',
  VIEW,
  asyncHandler(async (req, res) => {
    let whereClause = '';
    const params = [];

    if (req.user.role === 'employee') {
      if (!req.user.employeeId) return res.json({ exitDocuments: [] });
      whereClause = 'WHERE eed.employee_id = ?';
      params.push(req.user.employeeId);
    }

    const [documents] = await pool.query(`
      SELECT eed.*,
        e.first_name, e.last_name, e.employee_code, e.email AS employee_email, e.designation,
        d.name AS department_name,
        u.name AS generated_by_name
      FROM employee_exit_documents eed
      JOIN hrm_employees e ON e.id = eed.employee_id
      LEFT JOIN hrm_departments d ON d.id = e.department_id
      LEFT JOIN hrm_users u ON u.id = eed.generated_by
      ${whereClause}
      ORDER BY eed.generated_at DESC
    `, params);

    res.json({ exitDocuments: documents });
  })
);

/**
 * Generate Exit Document (Experience letter, Relieving letter, Exit confirmation, Final settlement)
 */
router.post(
  '/exit-documents',
  MANAGE,
  asyncHandler(async (req, res) => {
    const { employee_id, resignation_id, doc_type, title, content_html } = req.body;
    if (!employee_id || !doc_type) {
      throw new ApiError(400, 'Employee ID and Document Type are required.');
    }

    const [[employee]] = await pool.query(`
      SELECT e.*, d.name AS department_name
      FROM hrm_employees e
      LEFT JOIN hrm_departments d ON d.id = e.department_id
      WHERE e.id = ?
    `, [employee_id]);
    if (!employee) throw new ApiError(404, 'Employee not found.');

    const year = new Date().getFullYear();
    const prefix = `EXT-${year}-`;
    const [[maxRow]] = await pool.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(document_number, ?) AS UNSIGNED)), 0) AS maxCode
       FROM employee_exit_documents WHERE document_number LIKE ?`,
      [prefix.length + 1, `${prefix}%`]
    );
    const docNumber = `${prefix}${String(Number(maxRow.maxCode) + 1).padStart(4, '0')}`;

    const docTitle = title || `${doc_type.replace(/_/g, ' ').toUpperCase()} - ${employee.first_name} ${employee.last_name}`;

    const [resDoc] = await pool.query(`
      INSERT INTO employee_exit_documents
        (employee_id, resignation_id, doc_type, document_number, title, content_html, pdf_filename, generated_by)
      VALUES (?,?,?,?,?,?,?,?)
    `, [
      employee_id,
      resignation_id || null,
      doc_type,
      docNumber,
      docTitle,
      content_html || null,
      `${docNumber}.pdf`,
      req.user.id,
    ]);

    await audit(req, {
      action: 'offboarding.exit_doc.generate',
      entity: 'employee_exit_document',
      entityId: resDoc.insertId,
      details: { docNumber, doc_type, employee_id },
    });

    res.status(201).json({
      id: resDoc.insertId,
      document_number: docNumber,
      message: 'Exit document created successfully.',
    });
  })
);

/**
 * Download Exit Document PDF
 */
router.get(
  '/exit-documents/:id/pdf',
  VIEW,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [[doc]] = await pool.query(`
      SELECT eed.*,
        e.first_name, e.last_name, e.employee_code, e.join_date, e.designation,
        d.name AS department_name,
        er.approved_last_working_day
      FROM employee_exit_documents eed
      JOIN hrm_employees e ON e.id = eed.employee_id
      LEFT JOIN hrm_departments d ON d.id = e.department_id
      LEFT JOIN employee_resignations er ON er.id = eed.resignation_id
      WHERE eed.id = ?
    `, [id]);

    if (!doc) throw new ApiError(404, 'Exit document not found.');

    if (req.user.role === 'employee' && req.user.employeeId !== doc.employee_id) {
      throw new ApiError(403, 'Unauthorized access to exit document.');
    }

    const pdfBuffer = await generateExitDocPdf(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.document_number}.pdf"`);
    res.send(pdfBuffer);
  })
);

export default router;


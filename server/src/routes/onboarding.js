import { Router } from 'express';
import pool from '../db.js';
import { asyncHandler, ApiError } from '../utils.js';
import { authenticate, requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { audit } from '../audit.js';
import { uploadDocumentMiddleware, getDocPath } from '../services/document-storage.js';
import fs from 'node:fs';

const router = Router();
router.use(authenticate);

const VIEW = requireAnyPermission('onboarding.view', 'onboarding.manage', 'onboarding.self');
const MANAGE = requirePermission('onboarding.manage');

// These mirror the database enums. Validating before writing turns invalid
// input into a clear 400 response instead of a MySQL truncation error (500).
const TEMPLATE_TYPES = ['internship', 'full_time', 'contract', 'fresher'];
const TEMPLATE_TASK_CATEGORIES = [
  'PERSONAL INFORMATION',
  'DOCUMENT VERIFICATION',
  'EMPLOYMENT FORMALITIES',
];
const DOCUMENT_TYPES = [
  'identity_proof',
  'pan_card',
  'address_proof',
  'photograph',
  'educational_certificate',
  'previous_employment',
  'bank_proof',
  'signed_offer_letter',
  'employment_agreement',
  'other',
];

function discardUploadedDocument(file) {
  if (!file?.filename) return;
  try {
    fs.unlinkSync(getDocPath(file.filename));
  } catch {
    // Best-effort cleanup; never mask the validation error.
  }
}

/**
 * Onboarding overview stats for HR & CEO
 */
router.get(
  '/dashboard',
  VIEW,
  asyncHandler(async (req, res) => {
    const [[counts]] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS submitted,
        SUM(CASE WHEN status = 'under_review' THEN 1 ELSE 0 END) AS under_review,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
      FROM onboarding_records
    `);

    const [[taskCounts]] = await pool.query(`
      SELECT
        COUNT(*) AS total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
        SUM(CASE WHEN status IN ('submitted','under_review') THEN 1 ELSE 0 END) AS pending_verification
      FROM onboarding_tasks
    `);

    const [recent] = await pool.query(`
      SELECT obr.*,
        c.full_name AS candidate_name, c.email AS candidate_email,
        e.first_name, e.last_name, e.employee_code,
        d.name AS department_name
      FROM onboarding_records obr
      LEFT JOIN recruitment_candidates c ON c.id = obr.candidate_id
      LEFT JOIN hrm_employees e ON e.id = obr.employee_id
      LEFT JOIN hrm_departments d ON d.id = obr.department_id
      ORDER BY obr.created_at DESC LIMIT 5
    `);

    res.json({
      metrics: {
        total: Number(counts.total) || 0,
        pending: Number(counts.pending) || 0,
        inProgress: Number(counts.in_progress) || 0,
        submitted: Number(counts.submitted) || 0,
        underReview: Number(counts.under_review) || 0,
        completed: Number(counts.completed) || 0,
        rejected: Number(counts.rejected) || 0,
        totalTasks: Number(taskCounts.total_tasks) || 0,
        completedTasks: Number(taskCounts.completed_tasks) || 0,
        pendingVerification: Number(taskCounts.pending_verification) || 0,
      },
      recent,
    });
  })
);

/**
 * List onboarding records (Filtered by search/status/role)
 */
router.get(
  '/records',
  VIEW,
  asyncHandler(async (req, res) => {
    // If employee role, show only own record
    let empCondition = '';
    const params = [];

    if (req.user.role === 'employee') {
      if (!req.user.employeeId) {
        return res.json({ records: [] });
      }
      empCondition = 'WHERE obr.employee_id = ?';
      params.push(req.user.employeeId);
    } else if (req.query.status) {
      empCondition = 'WHERE obr.status = ?';
      params.push(req.query.status);
    }

    const [records] = await pool.query(`
      SELECT obr.*,
        c.full_name AS candidate_name, c.email AS candidate_email, c.phone AS candidate_phone,
        e.first_name, e.last_name, e.employee_code, e.email AS employee_email,
        d.name AS department_name, d.color AS department_color,
        ot.name AS template_name,
        u.name AS hr_rep_name
      FROM onboarding_records obr
      LEFT JOIN recruitment_candidates c ON c.id = obr.candidate_id
      LEFT JOIN hrm_employees e ON e.id = obr.employee_id
      LEFT JOIN hrm_departments d ON d.id = obr.department_id
      LEFT JOIN onboarding_templates ot ON ot.id = obr.template_id
      LEFT JOIN hrm_users u ON u.id = obr.assigned_hr_id
      ${empCondition}
      ORDER BY obr.created_at DESC
    `, params);

    res.json({ records });
  })
);

/**
 * Get Single Onboarding Record with Tasks, Documents, Education and Bank Details
 */
router.get(
  '/records/:id',
  VIEW,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [[record]] = await pool.query(`
      SELECT obr.*,
        c.full_name AS candidate_name, c.email AS candidate_email, c.phone AS candidate_phone, c.alternate_phone,
        c.highest_qualification, c.location AS candidate_location,
        e.first_name, e.last_name, e.employee_code, e.email AS employee_email, e.date_of_birth, e.gender,
        e.address, e.city, e.country, e.salary,
        d.name AS department_name,
        ot.name AS template_name,
        u.name AS hr_rep_name,
        mgr.first_name AS mgr_first, mgr.last_name AS mgr_last
      FROM onboarding_records obr
      LEFT JOIN recruitment_candidates c ON c.id = obr.candidate_id
      LEFT JOIN hrm_employees e ON e.id = obr.employee_id
      LEFT JOIN hrm_departments d ON d.id = obr.department_id
      LEFT JOIN onboarding_templates ot ON ot.id = obr.template_id
      LEFT JOIN hrm_users u ON u.id = obr.assigned_hr_id
      LEFT JOIN hrm_employees mgr ON mgr.id = obr.reporting_manager_id
      WHERE obr.id = ?
    `, [id]);

    if (!record) throw new ApiError(404, 'Onboarding record not found.');

    // Permissions check: Employee can only see own
    if (req.user.role === 'employee' && req.user.employeeId !== record.employee_id) {
      throw new ApiError(403, 'You do not have permission to view this onboarding record.');
    }

    // Tasks
    const [tasks] = await pool.query(`
      SELECT ot.*, u.name AS verified_by_name
      FROM onboarding_tasks ot
      LEFT JOIN hrm_users u ON u.id = ot.verified_by
      WHERE ot.onboarding_id = ?
      ORDER BY ot.sort_order ASC, ot.id ASC
    `, [id]);

    // Documents
    const [documents] = await pool.query(`
      SELECT od.*, u.name AS verified_by_name
      FROM onboarding_documents od
      LEFT JOIN hrm_users u ON u.id = od.verified_by
      WHERE od.onboarding_id = ?
      ORDER BY od.uploaded_at DESC
    `, [id]);

    // Education
    let education = [];
    if (record.employee_id) {
      [education] = await pool.query(`
        SELECT * FROM employee_education WHERE employee_id = ? ORDER BY graduation_year DESC
      `, [record.employee_id]);
    }

    // Bank Details (Sensitive: Hidden from CEO or unprivileged roles)
    let bank = null;
    if (['super_admin', 'hr'].includes(req.user.role) || (req.user.role === 'employee' && req.user.employeeId === record.employee_id)) {
      if (record.employee_id) {
        const [[bankRow]] = await pool.query(`
          SELECT * FROM employee_bank_details WHERE employee_id = ?
        `, [record.employee_id]);
        bank = bankRow || null;
      }
    }

    if (req.user.role === 'ceo') {
      record.salary = undefined;
      record.date_of_birth = undefined;
      record.address = undefined;
      record.alternate_phone = undefined;
    }

    res.json({
      record,
      tasks,
      documents,
      education,
      bank,
    });
  })
);

/**
 * Initiate Onboarding (from Candidate Offer or Direct Employee)
 */
router.post(
  '/initiate',
  MANAGE,
  asyncHandler(async (req, res) => {
    const {
      candidate_id,
      application_id,
      offer_id,
      employee_id,
      joining_date,
      designation,
      department_id,
      reporting_manager_id,
      employment_type,
      work_location,
      assigned_hr_id,
      template_id,
    } = req.body;

    if (!joining_date || !designation) {
      throw new ApiError(400, 'Joining date and designation are required to initiate onboarding.');
    }

    // Check duplicate onboarding record
    if (candidate_id) {
      const [[existing]] = await pool.query('SELECT id FROM onboarding_records WHERE candidate_id = ?', [candidate_id]);
      if (existing) throw new ApiError(409, 'Onboarding is already initiated for this candidate.');
    }
    if (employee_id) {
      const [[existing]] = await pool.query('SELECT id FROM onboarding_records WHERE employee_id = ?', [employee_id]);
      if (existing) throw new ApiError(409, 'Onboarding is already initiated for this employee.');
    }

    // Check if employee needs to be created or linked
    let finalEmployeeId = employee_id || null;

    const [result] = await pool.query(`
      INSERT INTO onboarding_records
        (candidate_id, application_id, offer_id, employee_id, joining_date, designation,
         department_id, reporting_manager_id, employment_type, work_location, assigned_hr_id,
         template_id, status, progress_percent, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'pending', 0, ?)
    `, [
      candidate_id || null,
      application_id || null,
      offer_id || null,
      finalEmployeeId,
      joining_date,
      designation,
      department_id || null,
      reporting_manager_id || null,
      employment_type || 'full-time',
      work_location || 'Headquarters',
      assigned_hr_id || req.user.id,
      template_id || null,
      req.user.id,
    ]);

    const onboardingId = result.insertId;

    // Instantiate tasks from template
    if (template_id) {
      const [tplTasks] = await pool.query(
        'SELECT * FROM onboarding_template_tasks WHERE template_id = ? ORDER BY sort_order ASC',
        [template_id]
      );
      for (const t of tplTasks) {
        const dueDate = new Date(joining_date);
        dueDate.setDate(dueDate.getDate() + (t.due_days || 3));
        await pool.query(`
          INSERT INTO onboarding_tasks
            (onboarding_id, title, description, category, assigned_role, due_date, status, is_mandatory, sort_order)
          VALUES (?,?,?,?,?,?, 'pending', ?, ?)
        `, [
          onboardingId,
          t.title,
          t.description,
          t.category,
          t.assigned_role,
          dueDate.toISOString().slice(0, 10),
          t.is_mandatory,
          t.sort_order,
        ]);
      }
    }

    await audit(req, {
      action: 'onboarding.initiate',
      entity: 'onboarding_record',
      entityId: onboardingId,
      details: { candidate_id, employee_id: finalEmployeeId, designation },
    });

    res.status(201).json({
      id: onboardingId,
      message: 'Onboarding process successfully initiated.',
    });
  })
);

/**
 * Submit / Update Candidate & Employee Onboarding Details (Personal, Education, Bank)
 */
router.post(
  '/records/:id/submit-info',
  VIEW,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [[record]] = await pool.query('SELECT * FROM onboarding_records WHERE id = ?', [id]);
    if (!record) throw new ApiError(404, 'Onboarding record not found.');

    const {
      first_name,
      last_name,
      phone,
      alternate_phone,
      date_of_birth,
      gender,
      current_address,
      permanent_address,
      emergency_contact_name,
      emergency_contact_number,
      education,
      bank,
    } = req.body;

    const conn = await pool.getConnection();
    await conn.beginTransaction();

    try {
      // If employee already linked or candidate conversion
      let employeeId = record.employee_id;

      if (!employeeId && record.candidate_id) {
        // Fetch candidate & offer info to create employee cleanly
        const [[candidate]] = await conn.query('SELECT * FROM recruitment_candidates WHERE id = ?', [record.candidate_id]);
        let offer = null;
        if (record.offer_id) {
          const [[offRow]] = await conn.query('SELECT * FROM recruitment_offers WHERE id = ?', [record.offer_id]);
          offer = offRow;
        }

        // Generate employee code
        const [[codeRow]] = await conn.query("SELECT COALESCE(MAX(CAST(SUBSTRING(employee_code, 5) AS UNSIGNED)), 100) AS maxCode FROM hrm_employees WHERE employee_code LIKE 'EMP-%'");
        const employeeCode = `EMP-${String(Number(codeRow.maxCode) + 1).padStart(3, '0')}`;

        const [empRes] = await conn.query(`
          INSERT INTO hrm_employees
            (employee_code, first_name, last_name, email, phone, gender, date_of_birth, address, city, country,
             department_id, designation, employment_type, status, join_date, salary, avatar_color, bio)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'probation',?,?, 'sky', 'Onboarded via Aurora HR Portal')
        `, [
          employeeCode,
          first_name || (candidate ? candidate.full_name.split(' ')[0] : 'New'),
          last_name || (candidate ? candidate.full_name.split(' ').slice(1).join(' ') : 'Hire'),
          candidate ? candidate.email : 'newhire@aurorahr.internal',
          phone || (candidate ? candidate.phone : null),
          gender || 'other',
          date_of_birth || null,
          current_address || null,
          candidate ? candidate.location : 'Headquarters',
          'United States',
          record.department_id,
          record.designation,
          record.employment_type,
          record.joining_date,
          offer ? Math.round((Number(offer.annual_salary) / 12) * 100) / 100 : 0,
        ]);

        employeeId = empRes.insertId;

        // Update onboarding record and recruitment application
        await conn.query('UPDATE onboarding_records SET employee_id = ? WHERE id = ?', [employeeId, id]);
        if (record.application_id) {
          await conn.query(`
            UPDATE recruitment_applications
            SET converted_employee_id = ?, converted_at = NOW(), stage = 'hired'
            WHERE id = ?
          `, [employeeId, record.application_id]);
        }
      } else if (employeeId) {
        // Update existing employee record
        await conn.query(`
          UPDATE hrm_employees
          SET first_name = COALESCE(?, first_name),
              last_name = COALESCE(?, last_name),
              phone = COALESCE(?, phone),
              date_of_birth = COALESCE(?, date_of_birth),
              gender = COALESCE(?, gender),
              address = COALESCE(?, address)
          WHERE id = ?
        `, [first_name, last_name, phone, date_of_birth, gender, current_address, employeeId]);
      }

      // Upsert Education
      if (education && employeeId) {
        await conn.query('DELETE FROM employee_education WHERE employee_id = ?', [employeeId]);
        for (const edu of education) {
          if (edu.highest_qualification && edu.institution) {
            await conn.query(`
              INSERT INTO employee_education
                (employee_id, highest_qualification, institution, course_specialization, graduation_year, score_percentage_cgpa)
              VALUES (?,?,?,?,?,?)
            `, [
              employeeId,
              edu.highest_qualification,
              edu.institution,
              edu.course_specialization || 'General',
              Number(edu.graduation_year) || new Date().getFullYear(),
              edu.score_percentage_cgpa || 'Completed',
            ]);
          }
        }
      }

      // Upsert Bank Details (Secure)
      if (bank && bank.account_number && employeeId) {
        await conn.query(`
          INSERT INTO employee_bank_details
            (employee_id, account_holder_name, bank_name, account_number, ifsc_code, branch_name)
          VALUES (?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE
            account_holder_name = VALUES(account_holder_name),
            bank_name = VALUES(bank_name),
            account_number = VALUES(account_number),
            ifsc_code = VALUES(ifsc_code),
            branch_name = VALUES(branch_name)
        `, [
          employeeId,
          bank.account_holder_name || `${first_name || ''} ${last_name || ''}`.trim(),
          bank.bank_name,
          bank.account_number,
          bank.ifsc_code,
          bank.branch_name || 'Main Branch',
        ]);
      }

      // Update Onboarding status to in_progress or submitted
      await conn.query(`
        UPDATE onboarding_records
        SET status = 'submitted', updated_at = NOW()
        WHERE id = ?
      `, [id]);

      // Complete Personal Information tasks
      await conn.query(`
        UPDATE onboarding_tasks
        SET status = 'completed', completed_at = NOW(), completed_by = ?
        WHERE onboarding_id = ? AND category = 'PERSONAL INFORMATION'
      `, [req.user.id, id]);

      await conn.commit();
      res.json({ success: true, message: 'Onboarding information submitted successfully.' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

/**
 * Upload an onboarding document
 */
router.post(
  '/records/:id/documents',
  VIEW,
  uploadDocumentMiddleware,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const docType = req.body?.doc_type || 'other';

    try {
      if (!DOCUMENT_TYPES.includes(docType)) {
        throw new ApiError(
          400,
          `Invalid document type '${docType}'. Allowed values: ${DOCUMENT_TYPES.join(', ')}.`
        );
      }

      const [[record]] = await pool.query('SELECT * FROM onboarding_records WHERE id = ?', [id]);
      if (!record) throw new ApiError(404, 'Onboarding record not found.');
      if (!req.file) throw new ApiError(400, 'Please select a document file to upload.');

      const title = req.body?.title || req.file.originalname;
      const taskId = req.body?.task_id ? Number(req.body.task_id) : null;

      const [resDoc] = await pool.query(`
        INSERT INTO onboarding_documents
          (onboarding_id, task_id, doc_type, title, file_path, original_filename, file_size, mime_type, status)
        VALUES (?,?,?,?,?,?,?,?, 'submitted')
      `, [
        id,
        taskId,
        docType,
        title,
        req.file.filename,
        req.file.originalname,
        req.file.size,
        req.file.mimetype,
      ]);

      if (taskId) {
        await pool.query("UPDATE onboarding_tasks SET status = 'submitted' WHERE id = ?", [taskId]);
      }

      res.status(201).json({
        id: resDoc.insertId,
        message: 'Document uploaded successfully.',
        filename: req.file.originalname,
      });
    } catch (err) {
      discardUploadedDocument(req.file);
      throw err;
    }
  })
);

/**
 * Download an authorized onboarding document (Restricted URL)
 */
router.get(
  '/documents/:docId/download',
  VIEW,
  asyncHandler(async (req, res) => {
    const docId = Number(req.params.docId);
    const [[doc]] = await pool.query(`
      SELECT od.*, obr.employee_id
      FROM onboarding_documents od
      JOIN onboarding_records obr ON obr.id = od.onboarding_id
      WHERE od.id = ?
    `, [docId]);

    if (!doc) throw new ApiError(404, 'Document not found.');

    // If employee role, ensure they own it
    if (req.user.role === 'employee' && req.user.employeeId !== doc.employee_id) {
      throw new ApiError(403, 'Unauthorized to access this document.');
    }

    const fullPath = getDocPath(doc.file_path);
    if (!fs.existsSync(fullPath)) {
      throw new ApiError(404, 'File does not exist on disk.');
    }

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.original_filename)}"`);
    res.sendFile(fullPath);
  })
);

/**
 * Verify / Reject an Onboarding Document
 */
router.patch(
  '/documents/:docId/verify',
  MANAGE,
  asyncHandler(async (req, res) => {
    const docId = Number(req.params.docId);
    const { status, rejection_reason } = req.body;
    if (!['verified', 'rejected'].includes(status)) {
      throw new ApiError(400, "Status must be either 'verified' or 'rejected'.");
    }

    const [[doc]] = await pool.query('SELECT * FROM onboarding_documents WHERE id = ?', [docId]);
    if (!doc) throw new ApiError(404, 'Document not found.');

    await pool.query(`
      UPDATE onboarding_documents
      SET status = ?, rejection_reason = ?, verified_by = ?, verified_at = NOW()
      WHERE id = ?
    `, [status, status === 'rejected' ? rejection_reason || 'Rejected by HR' : null, req.user.id, docId]);

    // Update associated task if any
    if (doc.task_id) {
      await pool.query(`
        UPDATE onboarding_tasks
        SET status = ?, verified_by = ?, verified_at = NOW(), rejection_reason = ?
        WHERE id = ?
      `, [status === 'verified' ? 'completed' : 'rejected', req.user.id, rejection_reason || null, doc.task_id]);
    }

    res.json({ message: `Document marked as ${status}.` });
  })
);

/**
 * Complete Onboarding (Final HR Action)
 */
router.post(
  '/records/:id/complete',
  MANAGE,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [[record]] = await pool.query('SELECT * FROM onboarding_records WHERE id = ?', [id]);
    if (!record) throw new ApiError(404, 'Onboarding record not found.');

    if (!record.employee_id) {
      throw new ApiError(400, 'Employee profile must be generated before completing onboarding.');
    }

    // Set employee status to active
    await pool.query("UPDATE hrm_employees SET status = 'active' WHERE id = ?", [record.employee_id]);
    await pool.query(`
      UPDATE onboarding_records
      SET status = 'completed', progress_percent = 100, completed_at = NOW()
      WHERE id = ?
    `, [id]);

    await audit(req, {
      action: 'onboarding.complete',
      entity: 'onboarding_record',
      entityId: id,
      details: { employee_id: record.employee_id },
    });

    res.json({ success: true, message: 'Onboarding completed and employee is now Active!' });
  })
);

/**
 * Onboarding Templates CRUD
 */
router.get(
  '/templates',
  VIEW,
  asyncHandler(async (req, res) => {
    const [templates] = await pool.query(`
      SELECT ot.*, d.name AS department_name,
        (SELECT COUNT(*)
         FROM onboarding_template_tasks ott
         WHERE ott.template_id = ot.id) AS task_count
      FROM onboarding_templates ot
      LEFT JOIN hrm_departments d ON d.id = ot.department_id
      ORDER BY ot.created_at DESC
    `);
    res.json({ templates });
  })
);

router.get(
  '/templates/:id',
  VIEW,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [[template]] = await pool.query('SELECT * FROM onboarding_templates WHERE id = ?', [id]);
    if (!template) throw new ApiError(404, 'Template not found.');

    const [tasks] = await pool.query(
      'SELECT * FROM onboarding_template_tasks WHERE template_id = ? ORDER BY sort_order ASC',
      [id]
    );

    res.json({ template, tasks });
  })
);

router.post(
  '/templates',
  MANAGE,
  asyncHandler(async (req, res) => {
    const { name, type, description, department_id, designation, tasks } = req.body;
    if (!name || !type) throw new ApiError(400, 'Template name and type are required.');

    if (!TEMPLATE_TYPES.includes(type)) {
      throw new ApiError(
        400,
        `Invalid template type '${type}'. Allowed values: ${TEMPLATE_TYPES.join(', ')}.`
      );
    }

    if (tasks !== undefined && !Array.isArray(tasks)) {
      throw new ApiError(400, 'Template tasks must be an array.');
    }

    const normalizedTasks = (tasks || []).map((task, index) => {
      if (!task || typeof task !== 'object') {
        throw new ApiError(400, `Task at position ${index + 1} must be an object.`);
      }
      if (!task.title || typeof task.title !== 'string' || !task.title.trim()) {
        throw new ApiError(400, `Task at position ${index + 1} requires a title.`);
      }
      const category = task.category || 'PERSONAL INFORMATION';
      if (!TEMPLATE_TASK_CATEGORIES.includes(category)) {
        throw new ApiError(
          400,
          `Invalid task category '${category}' at position ${index + 1}. Allowed values: ${TEMPLATE_TASK_CATEGORIES.join(', ')}.`
        );
      }
      if (task.due_days !== undefined && task.due_days !== null) {
        const dueDays = Number(task.due_days);
        if (!Number.isInteger(dueDays) || dueDays < 0) {
          throw new ApiError(
            400,
            `Task due_days at position ${index + 1} must be a non-negative integer.`
          );
        }
      }
      return { ...task, category };
    });

    const [resTpl] = await pool.query(`
      INSERT INTO onboarding_templates (name, type, description, department_id, designation, created_by)
      VALUES (?,?,?,?,?,?)
    `, [name, type, description || null, department_id || null, designation || null, req.user.id]);

    const templateId = resTpl.insertId;
    if (normalizedTasks.length) {
      let order = 1;
      for (const t of normalizedTasks) {
        await pool.query(`
          INSERT INTO onboarding_template_tasks
            (template_id, title, description, category, assigned_role, due_days, is_mandatory, sort_order)
          VALUES (?,?,?,?,?,?,?,?)
        `, [templateId, t.title, t.description || null, t.category, t.assigned_role || 'employee', t.due_days || 3, t.is_mandatory ?? 1, order++]);
      }
    }

    res.status(201).json({ id: templateId, message: 'Onboarding template created.' });
  })
);

export default router;

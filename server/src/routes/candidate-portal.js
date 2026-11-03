import { Router } from 'express';
import pool from '../db.js';
import { asyncHandler, ApiError } from '../utils.js';
import {
  verifyCandidateToken,
  createCandidateInvitation,
  sendCandidateInvitationEmail,
} from '../services/candidate-portal.js';
import { generateOfferLetterPdf } from '../services/pdf.js';
import { triggerAutomaticOnboarding, ensureEmployeeForCandidate } from '../services/onboarding-automation.js';
import { uploadDocumentMiddleware, getDocPath } from '../services/document-storage.js';
import fs from 'node:fs';

const router = Router();

/**
 * Middleware: Scoped Candidate Authentication
 * Extracts token from Authorization header (Bearer <token>) or query string (?token=<token>).
 * Strictly restricts the candidate to their own offer, application, and onboarding record.
 */
async function authenticateCandidate(req, res, next) {
  const authHeader = req.headers.authorization;
  const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.query.token;

  if (!rawToken) {
    return next(new ApiError(401, 'Candidate authentication token required.'));
  }

  try {
    const tokenRecord = await verifyCandidateToken(rawToken);
    req.candidate = tokenRecord;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/portal/candidate/session
 * Validates candidate session and returns scoped candidate data
 */
router.get(
  '/session',
  authenticateCandidate,
  asyncHandler(async (req, res) => {
    const { candidate_id, offer_id, application_id } = req.candidate;

    // Fetch candidate details
    const [[candidate]] = await pool.query(
      'SELECT id, full_name, email, phone, location FROM recruitment_candidates WHERE id = ?',
      [candidate_id]
    );

    // Fetch candidate offer
    let offer = null;
    const [offerRows] = await pool.query(
      `SELECT o.*, d.name AS department_name
       FROM recruitment_offers o
       LEFT JOIN hrm_departments d ON d.id = o.department_id
       WHERE o.candidate_id = ? OR o.id = ? OR o.application_id = ?
       ORDER BY o.created_at DESC LIMIT 1`,
      [candidate_id, offer_id, application_id]
    );
    if (offerRows.length) offer = offerRows[0];

    // Fetch candidate onboarding record if exists
    let onboarding = null;
    let tasks = [];
    let documents = [];

    const [onbRows] = await pool.query(
      `SELECT * FROM onboarding_records WHERE candidate_id = ? OR offer_id = ? LIMIT 1`,
      [candidate_id, offer?.id || null]
    );

    if (onbRows.length) {
      onboarding = onbRows[0];
      [tasks] = await pool.query(
        'SELECT * FROM onboarding_tasks WHERE onboarding_id = ? ORDER BY sort_order ASC, id ASC',
        [onboarding.id]
      );
      [documents] = await pool.query(
        'SELECT id, title, doc_type, original_filename, file_size, status, uploaded_at FROM onboarding_documents WHERE onboarding_id = ? ORDER BY uploaded_at DESC',
        [onboarding.id]
      );
    }

    res.json({
      candidate,
      offer,
      onboarding,
      tasks,
      documents,
    });
  })
);

/**
 * GET /api/portal/candidate/offer/pdf
 * Download the offer letter PDF securely
 */
router.get(
  '/offer/pdf',
  authenticateCandidate,
  asyncHandler(async (req, res) => {
    const { candidate_id, offer_id } = req.candidate;
    const [offerRows] = await pool.query(
      `SELECT o.*, c.full_name AS candidate_name, c.email AS candidate_email, c.phone AS candidate_phone, c.location AS candidate_address, d.name AS department_name
       FROM recruitment_offers o
       JOIN recruitment_applications a ON a.id = o.application_id
       JOIN recruitment_candidates c ON c.id = a.candidate_id
       LEFT JOIN hrm_departments d ON d.id = o.department_id
       WHERE o.candidate_id = ? OR o.id = ?
       ORDER BY o.created_at DESC LIMIT 1`,
      [candidate_id, offer_id]
    );

    if (!offerRows.length) throw new ApiError(404, 'Offer not found.');
    const offer = offerRows[0];

    const pdfBuffer = await generateOfferLetterPdf(offer);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${offer.offer_number || 'Offer_Letter'}.pdf"`);
    res.send(pdfBuffer);
  })
);

/**
 * POST /api/portal/candidate/offer/respond
 * Candidate responds (accept or decline) to the offer
 */
router.post(
  '/offer/respond',
  authenticateCandidate,
  asyncHandler(async (req, res) => {
    const { candidate_id, offer_id } = req.candidate;
    const { action, response_notes } = req.body;

    if (!['accept', 'decline'].includes(action)) {
      throw new ApiError(400, "Action must be either 'accept' or 'decline'.");
    }

    // Load offer and validate it is awaiting response
    const [offerRows] = await pool.query(
      `SELECT o.*, c.full_name AS candidate_name, c.email AS candidate_email, j.title AS job_title
       FROM recruitment_offers o
       JOIN recruitment_applications a ON a.id = o.application_id
       JOIN recruitment_candidates c ON c.id = a.candidate_id
       JOIN recruitment_jobs j ON j.id = a.job_id
       WHERE (o.candidate_id = ? OR o.id = ?) AND o.status IN ('draft', 'sent')
       ORDER BY o.created_at DESC LIMIT 1`,
      [candidate_id, offer_id]
    );

    if (!offerRows.length) {
      throw new ApiError(400, 'This offer is no longer awaiting a response or has expired.');
    }

    const offer = offerRows[0];
    const newStatus = action === 'accept' ? 'accepted' : 'rejected';

    await pool.query(
      `UPDATE recruitment_offers
       SET status = ?, responded_at = NOW(), response_notes = ?
       WHERE id = ?`,
      [newStatus, response_notes || null, offer.id]
    );

    if (newStatus === 'accepted') {
      // 1. Update application stage
      await pool.query(
        `UPDATE recruitment_applications SET stage = 'offer_sent', stage_updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [offer.application_id]
      );

      // 2. Automated Onboarding Trigger: creates onboarding record, tasks, and single employee cleanly
      const { onboardingId, employeeId } = await triggerAutomaticOnboarding({
        offerId: offer.id,
        actorId: null,
      });

      // 3. Generate portal invitation for onboarding
      const { rawToken } = await createCandidateInvitation({
        candidateId: candidate_id,
        offerId: offer.id,
        applicationId: offer.application_id,
        email: offer.candidate_email,
        scope: 'onboarding',
      });

      // 4. Send onboarding welcome & invitation email
      await sendCandidateInvitationEmail({
        candidateName: offer.candidate_name,
        candidateEmail: offer.candidate_email,
        jobTitle: offer.job_title,
        rawToken,
        type: 'onboarding',
      });

      return res.json({
        success: true,
        status: 'accepted',
        onboardingId,
        message: 'Congratulations! You have accepted the offer. Your onboarding workspace is now ready.',
      });
    } else {
      // Rejected
      await pool.query(
        `UPDATE recruitment_applications
         SET stage = 'rejected', rejection_reason = ?, stage_updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [response_notes || 'Declined by candidate in portal', offer.application_id]
      );

      return res.json({
        success: true,
        status: 'rejected',
        message: 'You have declined the offer.',
      });
    }
  })
);

/**
 * POST /api/portal/candidate/onboarding/submit-info
 * Candidate submits personal, educational, and bank details
 */
router.post(
  '/onboarding/submit-info',
  authenticateCandidate,
  asyncHandler(async (req, res) => {
    const { candidate_id } = req.candidate;

    const [[onb]] = await pool.query(
      'SELECT * FROM onboarding_records WHERE candidate_id = ? LIMIT 1',
      [candidate_id]
    );
    if (!onb) throw new ApiError(404, 'Onboarding record not found for this candidate.');

    const {
      first_name,
      last_name,
      phone,
      date_of_birth,
      gender,
      current_address,
      education,
      bank,
    } = req.body;

    // Use unified employee creation / linking
    const { employee } = await ensureEmployeeForCandidate({
      candidateId: candidate_id,
      applicationId: onb.application_id,
      offerId: onb.offer_id,
      onboardingId: onb.id,
      details: {
        first_name,
        last_name,
        phone,
        date_of_birth,
        gender,
        current_address,
      },
    });

    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      // Update Education
      if (education && employee.id) {
        await conn.query('DELETE FROM employee_education WHERE employee_id = ?', [employee.id]);
        for (const edu of education) {
          if (edu.highest_qualification && edu.institution) {
            await conn.query(`
              INSERT INTO employee_education
                (employee_id, highest_qualification, institution, course_specialization, graduation_year, score_percentage_cgpa)
              VALUES (?,?,?,?,?,?)
            `, [
              employee.id,
              edu.highest_qualification,
              edu.institution,
              edu.course_specialization || 'General',
              Number(edu.graduation_year) || new Date().getFullYear(),
              edu.score_percentage_cgpa || 'Completed',
            ]);
          }
        }
      }

      // Update Bank
      if (bank && bank.account_number && employee.id) {
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
          employee.id,
          bank.account_holder_name || `${first_name || ''} ${last_name || ''}`.trim(),
          bank.bank_name,
          bank.account_number,
          bank.ifsc_code,
          bank.branch_name || 'Main Branch',
        ]);
      }

      // Mark status as submitted
      await conn.query(`
        UPDATE onboarding_records
        SET status = 'submitted', progress_percent = GREATEST(progress_percent, 50), updated_at = NOW()
        WHERE id = ?
      `, [onb.id]);

      // Complete Personal Information tasks
      await conn.query(`
        UPDATE onboarding_tasks
        SET status = 'completed', completed_at = NOW()
        WHERE onboarding_id = ? AND category = 'PERSONAL INFORMATION'
      `, [onb.id]);

      await conn.commit();
      res.json({ success: true, message: 'Onboarding details submitted successfully.' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

/**
 * POST /api/portal/candidate/onboarding/documents
 * Candidate uploads required compliance proof
 */
router.post(
  '/onboarding/documents',
  authenticateCandidate,
  uploadDocumentMiddleware,
  asyncHandler(async (req, res) => {
    const { candidate_id } = req.candidate;
    const [[onb]] = await pool.query(
      'SELECT * FROM onboarding_records WHERE candidate_id = ? LIMIT 1',
      [candidate_id]
    );
    if (!onb) throw new ApiError(404, 'Onboarding record not found.');
    if (!req.file) throw new ApiError(400, 'Please select a file to upload.');

    const docType = req.body?.doc_type || 'other';
    const title = req.body?.title || req.file.originalname;
    const taskId = req.body?.task_id ? Number(req.body.task_id) : null;

    const [resDoc] = await pool.query(`
      INSERT INTO onboarding_documents
        (onboarding_id, task_id, doc_type, title, file_path, original_filename, file_size, mime_type, status)
      VALUES (?,?,?,?,?,?,?,?, 'submitted')
    `, [
      onb.id,
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
      success: true,
      id: resDoc.insertId,
      filename: req.file.originalname,
      message: 'Document uploaded successfully.',
    });
  })
);

export default router;


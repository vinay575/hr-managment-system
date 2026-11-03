import { Router } from 'express';
import pool from '../../db.js';
import { asyncHandler, ApiError } from '../../utils.js';
import { authenticate, requireAnyPermission, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../audit.js';
import { APPLICATION_SELECT, OFFER_STATUSES, cleanText, logActivity, pageParams, paginated, toIsoDate } from '../../recruitment-utils.js';
import { generateOfferLetterPdf } from '../../services/pdf.js';
import { sendEmail } from '../../services/mailer.js';
import { createCandidateInvitation } from '../../services/candidate-portal.js';

const router = Router();
router.use(authenticate);

const VIEW = requireAnyPermission('recruitment.offers.view', 'recruitment.offers.manage');
const MANAGE = requirePermission('recruitment.offers.manage');

const OFFER_SELECT = `
  SELECT o.*, a.stage AS application_stage, a.candidate_id, a.job_id,
    c.full_name AS candidate_name, c.email AS candidate_email, c.phone AS candidate_phone,
    c.location AS candidate_address, j.job_code, d.name AS department_name, d.color AS department_color,
    CONCAT(u.name) AS created_by_name
  FROM recruitment_offers o
  JOIN recruitment_applications a ON a.id = o.application_id
  JOIN recruitment_candidates c ON c.id = a.candidate_id
  JOIN recruitment_jobs j ON j.id = a.job_id
  LEFT JOIN hrm_departments d ON d.id = o.department_id
  LEFT JOIN hrm_users u ON u.id = o.created_by
`;

async function loadOffer(id) {
  const [rows] = await pool.query(`${OFFER_SELECT} WHERE o.id = ?`, [id]);
  if (!rows[0]) throw new ApiError(404, 'Offer not found.');
  return rows[0];
}

async function nextOfferNumber(db = pool) {
  const year = new Date().getFullYear();
  const prefix = `OFF-${year}-`;
  const [[row]] = await db.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(offer_number, ?) AS UNSIGNED)), 0) AS maxCode
     FROM recruitment_offers WHERE offer_number LIKE ?`,
    [prefix.length + 1, `${prefix}%`]
  );
  return `${prefix}${String(Number(row.maxCode) + 1).padStart(4, '0')}`;
}

function normalise(body) {
  const out = {};
  if (body.job_title !== undefined) out.job_title = cleanText(body.job_title, 150);
  if (body.department_id !== undefined)
    out.department_id = body.department_id === '' || body.department_id === null ? null : Number(body.department_id) || null;
  if (body.annual_salary !== undefined) {
    const salary = Number(body.annual_salary);
    if (!Number.isFinite(salary) || salary <= 0) throw new ApiError(400, 'Annual salary must be greater than zero.');
    out.annual_salary = salary;
  }
  if (body.salary_structure !== undefined) out.salary_structure = cleanText(body.salary_structure, 4000);
  if (body.joining_date !== undefined) out.joining_date = toIsoDate(body.joining_date);
  if (body.probation_months !== undefined)
    out.probation_months = Math.max(0, Math.min(24, Number(body.probation_months) || 0));
  if (body.employment_type !== undefined) {
    if (!['full-time', 'part-time', 'contract', 'intern'].includes(body.employment_type))
      throw new ApiError(400, 'Invalid employment type.');
    out.employment_type = body.employment_type;
  }
  if (body.expiry_date !== undefined) out.expiry_date = toIsoDate(body.expiry_date);
  if (body.terms !== undefined) out.terms = cleanText(body.terms, 8000);
  if (out.joining_date && out.expiry_date && out.expiry_date < out.joining_date)
    throw new ApiError(400, 'Offer expiry must be before the joining date.');
  return out;
}

router.get(
  '/',
  VIEW,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = pageParams(req.query, 10);
    const where = [];
    const params = [];
    if (req.query.status) {
      where.push('o.status = ?');
      params.push(req.query.status);
    }
    if (req.query.application_id) {
      where.push('o.application_id = ?');
      params.push(Number(req.query.application_id));
    }
    const search = cleanText(req.query.search, 120);
    if (search) {
      where.push('(c.full_name LIKE ? OR o.offer_number LIKE ? OR o.job_title LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[count]] = await pool.query(
      `SELECT COUNT(*) AS total FROM recruitment_offers o
       JOIN recruitment_applications a ON a.id = o.application_id
       JOIN recruitment_candidates c ON c.id = a.candidate_id ${clause}`,
      params
    );
    const [rows] = await pool.query(
      `${OFFER_SELECT} ${clause} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json(paginated(rows, count.total, page, limit));
  })
);

router.get(
  '/:id',
  VIEW,
  asyncHandler(async (req, res) => {
    const offer = await loadOffer(Number(req.params.id));
    const [history] = await pool.query(
      'SELECT * FROM recruitment_offers WHERE application_id = ? ORDER BY created_at DESC',
      [offer.application_id]
    );
    const [deliveries] = await pool.query(
      'SELECT * FROM offer_records WHERE offer_id = ? ORDER BY sent_at DESC',
      [offer.id]
    );
    const [applicationRows] = await pool.query(`${APPLICATION_SELECT} WHERE a.id = ?`, [offer.application_id]);
    res.json({ offer, application: applicationRows[0] || null, history, deliveries });
  })
);

/**
 * Dynamic PDF Generation & Download
 */
router.get(
  '/:id/pdf',
  VIEW,
  asyncHandler(async (req, res) => {
    const offer = await loadOffer(Number(req.params.id));
    const pdfBuffer = await generateOfferLetterPdf(offer);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${offer.offer_number || 'Offer_Letter'}.pdf"`);
    res.send(pdfBuffer);
  })
);

/**
 * Preview PDF Inline in browser
 */
router.get(
  '/:id/preview-pdf',
  VIEW,
  asyncHandler(async (req, res) => {
    const offer = await loadOffer(Number(req.params.id));
    const pdfBuffer = await generateOfferLetterPdf(offer);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${offer.offer_number || 'Offer_Letter'}.pdf"`);
    res.send(pdfBuffer);
  })
);

/**
 * Send Offer Letter by Email with PDF attached
 */
router.post(
  '/:id/send-email',
  MANAGE,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const offer = await loadOffer(id);

    // Validate mandatory candidate and offer info
    const recipientEmail = req.body?.email || offer.candidate_email;
    const recipientName = req.body?.name || offer.candidate_name;

    if (!recipientEmail || !recipientEmail.includes('@')) {
      throw new ApiError(400, 'Valid candidate email is required to send the offer letter.');
    }
    if (!offer.annual_salary || !offer.joining_date) {
      throw new ApiError(400, 'Offer salary and joining date are mandatory before sending.');
    }

    // 1. Generate dynamic latest PDF reflecting current details
    const pdfBuffer = await generateOfferLetterPdf({
      ...offer,
      candidate_email: recipientEmail,
      candidate_name: recipientName,
    });

    // Generate secure, time-limited candidate invitation token
    const { rawToken } = await createCandidateInvitation({
      candidateId: offer.candidate_id,
      offerId: id,
      applicationId: offer.application_id,
      email: recipientEmail,
      scope: 'offer',
      expiresInDays: 7,
    });

    const portalUrl = `${process.env.APP_URL || 'http://localhost:5173'}/portal/candidate?token=${rawToken}`;

    const subject = `Offer of Employment: ${offer.job_title} at Aurora Labs`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: auto;">
        <h2 style="color: #0f172a;">Welcome to Aurora Labs!</h2>
        <p>Dear <strong>${recipientName}</strong>,</p>
        <p>We are delighted to extend you an official offer of employment for the position of <strong>${offer.job_title}</strong> at Aurora Labs.</p>
        <p>Please find your official offer letter attached with this email for your detailed review.</p>
        <div style="margin: 20px 0; padding: 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
          <p style="margin: 0 0 8px 0;"><strong>Position:</strong> ${offer.job_title}</p>
          <p style="margin: 0 0 8px 0;"><strong>Joining Date:</strong> ${offer.joining_date ? String(offer.joining_date).slice(0, 10) : 'TBD'}</p>
          <p style="margin: 0 0 8px 0;"><strong>Annual CTC / Salary:</strong> $${Number(offer.annual_salary).toLocaleString()}</p>
          <p style="margin: 0;"><strong>Offer Validity:</strong> ${offer.expiry_date ? String(offer.expiry_date).slice(0, 10) : '14 Days'}</p>
        </div>
        <div style="margin: 25px 0; text-align: center;">
          <a href="${portalUrl}" style="background-color: #6366f1; color: #ffffff; padding: 12px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">
            Access Candidate Portal to Accept / Respond
          </a>
        </div>
        <p style="font-size: 12px; color: #64748b;">
          This link is securely tied to your application and expires in 7 days.
        </p>
        <br/>
        <p>Warm regards,<br/><strong>Aurora Labs People Team</strong></p>
      </div>
    `;

    // 2. Dispatch email with PDF attachment
    let emailResult;
    try {
      emailResult = await sendEmail({
        to: recipientEmail,
        subject,
        html,
        attachments: [
          {
            filename: `${offer.offer_number || 'Offer_Letter'}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
    } catch (mailErr) {
      // Record failure
      await pool.query(
        `INSERT INTO offer_records (offer_id, recipient_email, recipient_name, email_subject, delivery_status, delivery_message, pdf_filename, sent_by)
         VALUES (?,?,?,?, 'failed', ?, ?, ?)`,
        [id, recipientEmail, recipientName, subject, mailErr.message, `${offer.offer_number}.pdf`, req.user.id]
      );
      throw new ApiError(500, `Email dispatch failed: ${mailErr.message}`);
    }

    // 3. Mark offer status as 'sent' if draft, record timestamp
    await pool.query(
      `UPDATE recruitment_offers SET status = 'sent', sent_at = NOW() WHERE id = ?`,
      [id]
    );

    // Update application stage if selected
    if (offer.application_stage === 'selected') {
      await pool.query(
        `UPDATE recruitment_applications SET stage = 'offer_sent', stage_updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [offer.application_id]
      );
    }

    // 4. Record successful email delivery in offer_records
    await pool.query(
      `INSERT INTO offer_records (offer_id, recipient_email, recipient_name, email_subject, delivery_status, delivery_message, pdf_filename, sent_by)
       VALUES (?,?,?,?, 'sent', ?, ?, ?)`,
      [id, recipientEmail, recipientName, subject, 'Delivered successfully with PDF attachment', `${offer.offer_number}.pdf`, req.user.id]
    );

    await logActivity(pool, {
      jobId: offer.job_id,
      candidateId: offer.candidate_id,
      applicationId: offer.application_id,
      actor: req.user,
      action: 'offer.sent',
      details: { offerId: id, recipientEmail, offerNumber: offer.offer_number },
    });

    await audit(req, {
      action: 'recruitment.offer.send',
      entity: 'recruitment_offer',
      entityId: id,
      details: { recipientEmail, offerNumber: offer.offer_number },
    });

    res.json({
      success: true,
      offer: await loadOffer(id),
      message: `Offer letter PDF generated and sent successfully to ${recipientEmail}.`,
    });
  })
);

router.post(
  '/',
  MANAGE,
  asyncHandler(async (req, res) => {
    const applicationId = Number(req.body?.application_id);
    if (!applicationId) throw new ApiError(400, 'An application is required.');
    const data = normalise(req.body || {});
    if (!data.job_title) throw new ApiError(400, 'Job title is required.');
    if (!data.annual_salary) throw new ApiError(400, 'Annual salary is required.');
    if (!data.joining_date) throw new ApiError(400, 'Joining date is required.');

    const [[application]] = await pool.query(
      `SELECT a.*, j.title AS job_title, j.department_id, j.employment_type, c.full_name, c.email, c.phone, c.location
       FROM recruitment_applications a
       JOIN recruitment_jobs j ON j.id = a.job_id
       JOIN recruitment_candidates c ON c.id = a.candidate_id WHERE a.id = ?`,
      [applicationId]
    );
    if (!application) throw new ApiError(404, 'Application not found.');
    if (application.converted_employee_id)
      throw new ApiError(400, 'This candidate has already been converted to an employee.');
    if (!['selected', 'offer_sent'].includes(application.stage))
      throw new ApiError(400, 'An offer can only be created for candidates in the Selected stage.');

    // If candidate contact info is provided in request, update candidate record so latest values reflect everywhere
    if (req.body?.candidate_name || req.body?.candidate_email || req.body?.candidate_phone) {
      const candUpdates = [];
      const candParams = [];
      if (req.body.candidate_name) { candUpdates.push('full_name = ?'); candParams.push(cleanText(req.body.candidate_name, 150)); }
      if (req.body.candidate_email) { candUpdates.push('email = ?'); candParams.push(cleanText(req.body.candidate_email, 150)); }
      if (req.body.candidate_phone) { candUpdates.push('phone = ?'); candParams.push(cleanText(req.body.candidate_phone, 40)); }
      if (candUpdates.length) {
        candParams.push(application.candidate_id);
        await pool.query(`UPDATE recruitment_candidates SET ${candUpdates.join(', ')} WHERE id = ?`, candParams);
      }
    }

    const offerNumber = await nextOfferNumber(pool);
    const [result] = await pool.query(
      `INSERT INTO recruitment_offers
        (application_id, offer_number, job_title, department_id, annual_salary, salary_structure,
         joining_date, probation_months, employment_type, expiry_date, terms, status, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?, 'draft', ?)`,
      [
        applicationId,
        offerNumber,
        data.job_title || application.job_title,
        data.department_id ?? application.department_id,
        data.annual_salary,
        data.salary_structure,
        data.joining_date,
        data.probation_months ?? 3,
        data.employment_type || application.employment_type,
        data.expiry_date,
        data.terms,
        req.user.id,
      ]
    );
    await logActivity(pool, {
      jobId: application.job_id,
      candidateId: application.candidate_id,
      applicationId,
      actor: req.user,
      action: 'offer.created',
      details: { offerId: result.insertId, offerNumber, salary: data.annual_salary },
    });
    await audit(req, {
      action: 'recruitment.offer.create',
      entity: 'recruitment_offer',
      entityId: result.insertId,
      details: { applicationId, offerNumber, salary: data.annual_salary },
    });
    res.status(201).json({ offer: await loadOffer(result.insertId), message: 'Offer letter created.' });
  })
);

router.put(
  '/:id',
  MANAGE,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const offer = await loadOffer(id);
    if (offer.status !== 'draft')
      throw new ApiError(400, 'Only draft offers can be edited.');

    // Allow updating candidate details simultaneously
    if (req.body?.candidate_name || req.body?.candidate_email || req.body?.candidate_phone) {
      const candUpdates = [];
      const candParams = [];
      if (req.body.candidate_name) { candUpdates.push('full_name = ?'); candParams.push(cleanText(req.body.candidate_name, 150)); }
      if (req.body.candidate_email) { candUpdates.push('email = ?'); candParams.push(cleanText(req.body.candidate_email, 150)); }
      if (req.body.candidate_phone) { candUpdates.push('phone = ?'); candParams.push(cleanText(req.body.candidate_phone, 40)); }
      if (candUpdates.length) {
        candParams.push(offer.candidate_id);
        await pool.query(`UPDATE recruitment_candidates SET ${candUpdates.join(', ')} WHERE id = ?`, candParams);
      }
    }

    const data = normalise(req.body || {});
    const keys = Object.keys(data);
    if (keys.length) {
      await pool.query(
        `UPDATE recruitment_offers SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
        [...keys.map((k) => data[k]), id]
      );
    }
    await audit(req, { action: 'recruitment.offer.update', entity: 'recruitment_offer', entityId: id, details: { fields: keys } });
    res.json({ offer: await loadOffer(id), message: 'Offer letter updated.' });
  })
);

router.patch(
  '/:id/status',
  MANAGE,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const offer = await loadOffer(id);
    const action = String(req.body?.action || '').toLowerCase();
    const requested = String(req.body?.status || '').toLowerCase();
    const map = {
      send: 'sent',
      sent: 'sent',
      accept: 'accepted',
      accepted: 'accepted',
      reject: 'rejected',
      rejected: 'rejected',
      withdraw: 'withdrawn',
      withdrawn: 'withdrawn',
      expire: 'expired',
      expired: 'expired',
    };
    const next = map[action] || requested;
    if (!OFFER_STATUSES.includes(next)) throw new ApiError(400, 'Invalid offer status.');

    const allowed = {
      draft: ['sent', 'withdrawn'],
      sent: ['accepted', 'rejected', 'expired', 'withdrawn'],
      accepted: [],
      rejected: [],
      expired: [],
      withdrawn: [],
    };
    if (!allowed[offer.status]?.includes(next))
      throw new ApiError(400, `Cannot change an offer from ${offer.status} to ${next}.`);

    const sets = ['status = ?'];
    const params = [next];
    if (next === 'sent') sets.push('sent_at = NOW()');
    if (['accepted', 'rejected'].includes(next)) {
      sets.push('responded_at = NOW()');
      const notes = cleanText(req.body?.response_notes, 4000);
      if (notes) {
        sets.push('response_notes = ?');
        params.push(notes);
      }
    }
    params.push(id);
    await pool.query(`UPDATE recruitment_offers SET ${sets.join(', ')} WHERE id = ?`, params);

    if (next === 'sent' && offer.application_stage === 'selected') {
      await pool.query(
        `UPDATE recruitment_applications SET stage = 'offer_sent', stage_updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [offer.application_id]
      );
    }
    if (next === 'rejected') {
      await pool.query(
        `UPDATE recruitment_applications SET stage = 'rejected', rejection_reason = ?,
           stage_updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [cleanText(req.body?.response_notes, 2000) || 'Offer declined by candidate', offer.application_id]
      );
    }
    if (next === 'withdrawn' && offer.application_stage === 'offer_sent') {
      await pool.query(
        `UPDATE recruitment_applications SET stage = 'selected', stage_updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [offer.application_id]
      );
    }

    await logActivity(pool, {
      jobId: offer.job_id,
      candidateId: offer.candidate_id,
      applicationId: offer.application_id,
      actor: req.user,
      action: `offer.${next}`,
      details: { offerId: id, from: offer.status, to: next },
    });
    await audit(req, {
      action: 'recruitment.offer.status',
      entity: 'recruitment_offer',
      entityId: id,
      details: { from: offer.status, to: next },
    });
    res.json({ offer: await loadOffer(id), message: `Offer marked as ${next}.` });
  })
);

export default router;

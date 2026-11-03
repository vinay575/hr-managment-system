import { Router } from 'express';
import pool from '../../db.js';
import { asyncHandler, ApiError } from '../../utils.js';
import { authenticate, requireAnyPermission, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../audit.js';
import { insertEmployee, EMPLOYEE_SELECT } from '../../services/employees.js';
import {
  APPLICATION_SELECT,
  STAGES,
  STAGE_LABELS,
  canTransition,
  cleanText,
  logActivity,
  pageParams,
  paginated,
  today,
} from '../../recruitment-utils.js';

const router = Router();
router.use(authenticate);

const VIEW = requireAnyPermission('recruitment.candidates.view', 'recruitment.candidates.manage');
const MANAGE = requirePermission('recruitment.candidates.manage');
const HIRE = requirePermission('recruitment.hire');

async function loadApplication(id, db = pool) {
  const [rows] = await db.query(`${APPLICATION_SELECT} WHERE a.id = ?`, [id]);
  if (!rows[0]) throw new ApiError(404, 'Application not found.');
  return rows[0];
}

router.get(
  '/',
  VIEW,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = pageParams(req.query, 10);
    const where = [];
    const params = [];
    const search = cleanText(req.query.search, 120);
    if (search) {
      where.push('(c.full_name LIKE ? OR c.email LIKE ? OR j.title LIKE ? OR j.job_code LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (req.query.stage && STAGES.includes(req.query.stage)) {
      where.push('a.stage = ?');
      params.push(req.query.stage);
    }
    if (req.query.job_id) {
      where.push('a.job_id = ?');
      params.push(Number(req.query.job_id));
    }
    if (req.query.department_id) {
      where.push('j.department_id = ?');
      params.push(Number(req.query.department_id));
    }
    if (req.query.source) {
      where.push('c.source = ?');
      params.push(req.query.source);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[count]] = await pool.query(
      `SELECT COUNT(*) AS total FROM recruitment_applications a
       JOIN recruitment_candidates c ON c.id = a.candidate_id
       JOIN recruitment_jobs j ON j.id = a.job_id ${clause}`,
      params
    );
    const [rows] = await pool.query(
      `${APPLICATION_SELECT} ${clause} ORDER BY a.stage_updated_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json(paginated(rows, count.total, page, limit));
  })
);

router.get(
  '/pipeline',
  VIEW,
  asyncHandler(async (req, res) => {
    const where = [];
    const params = [];
    if (req.query.job_id) {
      where.push('a.job_id = ?');
      params.push(Number(req.query.job_id));
    }
    if (req.query.department_id) {
      where.push('j.department_id = ?');
      params.push(Number(req.query.department_id));
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `${APPLICATION_SELECT} ${clause} ORDER BY a.stage_updated_at DESC LIMIT 500`,
      params
    );
    const buckets = STAGES.map((stage) => ({
      stage,
      label: STAGE_LABELS[stage],
      count: rows.filter((r) => r.stage === stage).length,
      applications: rows.filter((r) => r.stage === stage),
    }));
    res.json({ data: rows, stages: buckets, total: rows.length });
  })
);

router.get(
  '/:id',
  VIEW,
  asyncHandler(async (req, res) => {
    const application = await loadApplication(Number(req.params.id));
    const [interviews] = await pool.query(
      `SELECT i.*, u.name AS interviewer_name,
              f.id AS feedback_id, f.overall_rating, f.recommendation
       FROM recruitment_interviews i
       LEFT JOIN hrm_users u ON u.id = i.interviewer_id
       LEFT JOIN recruitment_interview_feedback f ON f.interview_id = i.id
       WHERE i.application_id = ? ORDER BY i.scheduled_at DESC`,
      [application.id]
    );
    const [offers] = await pool.query(
      'SELECT * FROM recruitment_offers WHERE application_id = ? ORDER BY created_at DESC',
      [application.id]
    );
    const [history] = await pool.query(
      `SELECT * FROM recruitment_activity_logs WHERE application_id = ? ORDER BY created_at DESC LIMIT 100`,
      [application.id]
    );
    res.json({ application, interviews, offers, history });
  })
);

router.post(
  '/',
  MANAGE,
  asyncHandler(async (req, res) => {
    const jobId = Number(req.body?.job_id);
    const candidateId = Number(req.body?.candidate_id);
    if (!jobId || !candidateId) throw new ApiError(400, 'Both a vacancy and a candidate are required.');

    const [[job]] = await pool.query('SELECT * FROM recruitment_jobs WHERE id = ?', [jobId]);
    if (!job) throw new ApiError(404, 'Job vacancy not found.');
    if (job.status !== 'open') throw new ApiError(400, 'Applications are only accepted for open vacancies.');
    if (job.application_deadline && String(job.application_deadline).slice(0, 10) < today())
      throw new ApiError(400, 'The application deadline for this vacancy has passed.');
    const [[candidate]] = await pool.query('SELECT * FROM recruitment_candidates WHERE id = ?', [candidateId]);
    if (!candidate) throw new ApiError(404, 'Candidate not found.');

    try {
      const [result] = await pool.query(
        `INSERT INTO recruitment_applications (job_id, candidate_id, stage, created_by)
         VALUES (?, ?, 'applied', ?)`,
        [jobId, candidateId, req.user.id]
      );
      await logActivity(pool, {
        jobId,
        candidateId,
        applicationId: result.insertId,
        actor: req.user,
        action: 'application.created',
        details: { source: candidate.source },
      });
      await audit(req, { action: 'recruitment.application.create', entity: 'recruitment_application', entityId: result.insertId, details: { jobId, candidateId } });
      res.status(201).json({ application: await loadApplication(result.insertId), message: 'Candidate registered for the vacancy.' });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY')
        throw new ApiError(409, 'This candidate has already applied for that vacancy.');
      throw err;
    }
  })
);

router.patch(
  '/:id',
  MANAGE,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await loadApplication(id);
    const notes = cleanText(req.body?.recruiter_notes, 5000);
    const rejection = cleanText(req.body?.rejection_reason, 2000);
    const sets = [];
    const params = [];
    if (req.body?.recruiter_notes !== undefined) {
      sets.push('recruiter_notes = ?');
      params.push(notes);
    }
    if (req.body?.rejection_reason !== undefined && req.body?.allowReasonWithoutReject) {
      sets.push('rejection_reason = ?');
      params.push(rejection);
    }
    if (!sets.length) throw new ApiError(400, 'Nothing to update.');
    await pool.query(`UPDATE recruitment_applications SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    await activityFor(req, 'application.updated', { fields: Object.keys(req.body || {}) }, { applicationId: id });
    res.json({ application: await loadApplication(id), message: 'Application updated.' });
  })
);

router.patch(
  '/:id/stage',
  MANAGE,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const target = String(req.body?.stage || '');
    if (!STAGES.includes(target)) throw new ApiError(400, 'Invalid pipeline stage.');
    if (target === 'hired')
      throw new ApiError(403, 'Hired status is set automatically when a candidate is converted to an employee.');

    const application = await loadApplication(id);
    if (application.converted_employee_id)
      throw new ApiError(400, 'This candidate has already been converted to an employee.');
    if (!canTransition(application.stage, target))
      throw new ApiError(400, `Cannot move a candidate from ${STAGE_LABELS[application.stage]} to ${STAGE_LABELS[target]}.`);

    const reason = cleanText(req.body?.rejection_reason, 2000);
    const notes = cleanText(req.body?.recruiter_notes, 5000);
    if (target === 'rejected' && !reason)
      throw new ApiError(400, 'A rejection reason is required when rejecting a candidate.');

    const sets = ['stage = ?', 'stage_updated_at = CURRENT_TIMESTAMP'];
    const params = [target];
    if (reason !== null) {
      sets.push('rejection_reason = ?');
      params.push(reason);
    }
    if (notes !== null) {
      sets.push('recruiter_notes = ?');
      params.push(notes);
    }
    if (target !== 'rejected' && application.stage === 'rejected') {
      sets.push('rejection_reason = NULL');
    }
    params.push(id);
    await pool.query(`UPDATE recruitment_applications SET ${sets.join(', ')} WHERE id = ?`, params);

    await logActivity(pool, {
      jobId: application.job_id,
      candidateId: application.candidate_id,
      applicationId: id,
      actor: req.user,
      action: 'application.stage_changed',
      details: { from: application.stage, to: target, reason },
    });
    await audit(req, {
      action: 'recruitment.application.stage',
      entity: 'recruitment_application',
      entityId: id,
      details: { from: application.stage, to: target, reason },
    });
    res.json({
      application: await loadApplication(id),
      message: `Candidate moved to ${STAGE_LABELS[target]}.`,
    });
  })
);

router.get(
  '/:id/history',
  VIEW,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await loadApplication(id);
    const [rows] = await pool.query(
      'SELECT * FROM recruitment_activity_logs WHERE application_id = ? ORDER BY created_at DESC LIMIT 200',
      [id]
    );
    res.json({ data: rows });
  })
);

/* ------------------------------------------------------------------ */
/*  Candidate → Employee conversion                                    */
/* ------------------------------------------------------------------ */
router.post(
  '/:id/convert',
  HIRE,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body || {};
    const conn = await pool.getConnection();
    let employeeId = null;

    try {
      await conn.beginTransaction();
      const [[application]] = await conn.query(
        `SELECT a.*, j.title AS job_title, j.department_id, j.employment_type AS job_employment_type,
                c.full_name, c.email, c.phone, c.location, c.current_designation
         FROM recruitment_applications a
         JOIN recruitment_jobs j ON j.id = a.job_id
         JOIN recruitment_candidates c ON c.id = a.candidate_id
         WHERE a.id = ? FOR UPDATE`,
        [id]
      );
      if (!application) throw new ApiError(404, 'Application not found.');
      if (application.converted_employee_id)
        throw new ApiError(409, 'This candidate has already been converted to an employee.');

      const [offers] = await conn.query(
        `SELECT * FROM recruitment_offers WHERE application_id = ? AND status = 'accepted'
         ORDER BY responded_at DESC LIMIT 1`,
        [id]
      );
      const offer = offers[0];
      if (!offer)
        throw new ApiError(400, 'An accepted offer is required before converting this candidate to an employee.');

      const [[existing]] = await conn.query(
        'SELECT id, employee_code FROM hrm_employees WHERE email = ? LIMIT 1',
        [body.email || application.email]
      );
      if (existing)
        throw new ApiError(409, `An employee with this email already exists (${existing.employee_code}).`);

      const nameParts = String(body.full_name || application.full_name || '').trim().split(/\s+/);
      const firstName = cleanText(body.first_name, 60) || nameParts[0] || 'New';
      const lastName = cleanText(body.last_name, 60) || nameParts.slice(1).join(' ') || 'Employee';
      const monthlySalary =
        body.salary !== undefined && body.salary !== ''
          ? Number(body.salary)
          : Math.round((Number(offer.annual_salary) / 12) * 100) / 100;

      const created = await insertEmployee(conn, {
        first_name: firstName,
        last_name: lastName,
        email: body.email || application.email,
        phone: body.phone || application.phone,
        gender: body.gender || 'other',
        date_of_birth: body.date_of_birth || null,
        address: body.address || null,
        city: body.city || application.location || null,
        country: body.country || 'United States',
        department_id: body.department_id || application.department_id || null,
        designation: body.designation || offer.job_title || application.job_title,
        employment_type: body.employment_type || offer.employment_type || application.job_employment_type || 'full-time',
        status: body.status || (Number(offer.probation_months) > 0 ? 'probation' : 'active'),
        join_date: body.join_date || offer.joining_date || today(),
        salary: Number.isFinite(monthlySalary) ? monthlySalary : 0,
        avatar_color: body.avatar_color || 'indigo',
        bio: body.bio || `Hired through recruitment for ${offer.job_title}.`,
      });
      employeeId = created.id;

      await conn.query(
        `UPDATE recruitment_applications
         SET stage = 'hired', stage_updated_at = CURRENT_TIMESTAMP,
             converted_employee_id = ?, converted_at = NOW(), converted_by = ?,
             rejection_reason = NULL
         WHERE id = ?`,
        [employeeId, req.user.id, id]
      );
      await logActivity(conn, {
        jobId: application.job_id,
        candidateId: application.candidate_id,
        applicationId: id,
        actor: req.user,
        action: 'candidate.converted',
        details: { employeeId, employeeCode: created.employeeCode, offerId: offer.id },
      });
      await conn.commit();

      const [employees] = await pool.query(`${EMPLOYEE_SELECT} WHERE e.id = ?`, [employeeId]);
      await audit(req, {
        action: 'recruitment.candidate.convert',
        entity: 'recruitment_application',
        entityId: id,
        details: { employeeId, employeeCode: created.employeeCode, offerNumber: offer.offer_number },
      });
      await audit(req, {
        action: 'employee.create',
        entity: 'employee',
        entityId: employeeId,
        details: { name: `${firstName} ${lastName}`, email: body.email || application.email, source: 'recruitment' },
      });
      res.status(201).json({
        employee: employees[0],
        application: await loadApplication(id),
        message: `${firstName} ${lastName} has been converted to employee ${created.employeeCode}.`,
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

export default router;

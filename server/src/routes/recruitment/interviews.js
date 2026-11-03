import { Router } from 'express';
import pool from '../../db.js';
import { asyncHandler, ApiError } from '../../utils.js';
import { authenticate, requireAnyPermission, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../audit.js';
import {
  APPLICATION_SELECT,
  INTERVIEW_MODES,
  INTERVIEW_TYPES,
  cleanText,
  logActivity,
  pageParams,
  paginated,
} from '../../recruitment-utils.js';

const router = Router();
router.use(authenticate);

const VIEW = requireAnyPermission('recruitment.interviews.view', 'recruitment.interviews.manage');
const MANAGE = requirePermission('recruitment.interviews.manage');
const FEEDBACK_VIEW = requireAnyPermission('recruitment.feedback.view', 'recruitment.feedback.manage');
const FEEDBACK_MANAGE = requirePermission('recruitment.feedback.manage');

const INTERVIEW_SELECT = `
  SELECT i.*, a.stage AS application_stage, a.job_id, a.candidate_id,
    c.full_name AS candidate_name, c.email AS candidate_email, c.phone AS candidate_phone,
    j.title AS job_title, j.job_code, d.name AS department_name,
    u.name AS interviewer_name, u.email AS interviewer_email,
    f.id AS feedback_id, f.overall_rating, f.recommendation
  FROM recruitment_interviews i
  JOIN recruitment_applications a ON a.id = i.application_id
  JOIN recruitment_candidates c ON c.id = a.candidate_id
  JOIN recruitment_jobs j ON j.id = a.job_id
  LEFT JOIN hrm_departments d ON d.id = j.department_id
  LEFT JOIN hrm_users u ON u.id = i.interviewer_id
  LEFT JOIN recruitment_interview_feedback f ON f.interview_id = i.id
`;

async function loadInterview(id) {
  const [rows] = await pool.query(`${INTERVIEW_SELECT} WHERE i.id = ?`, [id]);
  if (!rows[0]) throw new ApiError(404, 'Interview not found.');
  return rows[0];
}

function normaliseSchedule(body) {
  if (!body.scheduled_at) throw new ApiError(400, 'Interview date and time are required.');
  const when = new Date(body.scheduled_at);
  if (Number.isNaN(when.getTime())) throw new ApiError(400, 'Invalid interview date and time.');
  const type = body.interview_type || 'technical';
  const mode = body.mode || 'online';
  if (!INTERVIEW_TYPES.includes(type)) throw new ApiError(400, 'Invalid interview type.');
  if (!INTERVIEW_MODES.includes(mode)) throw new ApiError(400, 'Invalid interview mode.');
  if (mode === 'online' && body.meeting_link && !/^https?:\/\//i.test(body.meeting_link))
    throw new ApiError(400, 'Meeting link must start with http:// or https://');
  return {
    scheduled_at: when,
    duration_minutes: Math.min(480, Math.max(15, Number(body.duration_minutes) || 60)),
    interview_type: type,
    mode,
    meeting_link: cleanText(body.meeting_link, 500),
    location: cleanText(body.location, 255),
    notes: cleanText(body.notes, 3000),
    interviewer_id: body.interviewer_id ? Number(body.interviewer_id) : null,
  };
}

async function validateInterviewer(id) {
  if (!id) return null;
  const [rows] = await pool.query('SELECT id FROM hrm_users WHERE id = ? AND is_active = 1', [id]);
  if (!rows.length) throw new ApiError(400, 'Selected interviewer is not an active user.');
  return id;
}

router.get(
  '/',
  VIEW,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = pageParams(req.query, 20);
    const where = [];
    const params = [];
    if (req.query.status) {
      where.push('i.status = ?');
      params.push(req.query.status);
    }
    if (req.query.application_id) {
      where.push('i.application_id = ?');
      params.push(Number(req.query.application_id));
    }
    if (req.query.interviewer_id) {
      where.push('i.interviewer_id = ?');
      params.push(Number(req.query.interviewer_id));
    }
    if (req.query.from) {
      where.push('i.scheduled_at >= ?');
      params.push(`${req.query.from} 00:00:00`);
    }
    if (req.query.to) {
      where.push('i.scheduled_at <= ?');
      params.push(`${req.query.to} 23:59:59`);
    }
    if (req.query.upcoming === '1') {
      where.push("i.scheduled_at >= NOW() AND i.status IN ('scheduled','rescheduled')");
    }
    const search = cleanText(req.query.search, 120);
    if (search) {
      where.push('(c.full_name LIKE ? OR j.title LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[count]] = await pool.query(
      `SELECT COUNT(*) AS total FROM recruitment_interviews i
       JOIN recruitment_applications a ON a.id = i.application_id
       JOIN recruitment_candidates c ON c.id = a.candidate_id
       JOIN recruitment_jobs j ON j.id = a.job_id ${clause}`,
      params
    );
    const [rows] = await pool.query(
      `${INTERVIEW_SELECT} ${clause} ORDER BY i.scheduled_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json(paginated(rows, count.total, page, limit));
  })
);

router.get(
  '/interviewers',
  VIEW,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT id, name, email, role FROM hrm_users WHERE is_active = 1 ORDER BY name`
    );
    res.json({ data: rows });
  })
);

router.get(
  '/:id',
  VIEW,
  asyncHandler(async (req, res) => {
    const interview = await loadInterview(Number(req.params.id));
    const [applicationRows] = await pool.query(`${APPLICATION_SELECT} WHERE a.id = ?`, [interview.application_id]);
    res.json({ interview, application: applicationRows[0] || null });
  })
);

router.post(
  '/',
  MANAGE,
  asyncHandler(async (req, res) => {
    const applicationId = Number(req.body?.application_id);
    if (!applicationId) throw new ApiError(400, 'An application is required.');
    const data = normaliseSchedule(req.body || {});
    data.interviewer_id = await validateInterviewer(data.interviewer_id);

    const [[application]] = await pool.query(
      'SELECT * FROM recruitment_applications WHERE id = ?',
      [applicationId]
    );
    if (!application) throw new ApiError(404, 'Application not found.');
    if (application.converted_employee_id)
      throw new ApiError(400, 'This candidate has already been converted to an employee.');
    if (['applied', 'screening', 'rejected', 'hired'].includes(application.stage))
      throw new ApiError(400, 'Shortlist the candidate before scheduling an interview.');
    if (data.scheduled_at.getTime() < Date.now() - 5 * 60 * 1000)
      throw new ApiError(400, 'Interview must be scheduled in the future.');

    const [result] = await pool.query(
      `INSERT INTO recruitment_interviews
        (application_id, interviewer_id, scheduled_at, duration_minutes, interview_type, mode,
         meeting_link, location, notes, status, created_by)
       VALUES (?,?,?,?,?,?,?,?,?, 'scheduled', ?)`,
      [
        applicationId,
        data.interviewer_id,
        data.scheduled_at,
        data.duration_minutes,
        data.interview_type,
        data.mode,
        data.meeting_link,
        data.location,
        data.notes,
        req.user.id,
      ]
    );

    if (application.stage === 'shortlisted') {
      await pool.query(
        `UPDATE recruitment_applications SET stage = 'interview_scheduled', stage_updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [applicationId]
      );
    }
    await logActivity(pool, {
      jobId: application.job_id,
      candidateId: application.candidate_id,
      applicationId,
      actor: req.user,
      action: 'interview.scheduled',
      details: { interviewId: result.insertId, at: data.scheduled_at, type: data.interview_type },
    });
    await audit(req, {
      action: 'recruitment.interview.schedule',
      entity: 'recruitment_interview',
      entityId: result.insertId,
      details: { applicationId, at: data.scheduled_at },
    });
    res.status(201).json({ interview: await loadInterview(result.insertId), message: 'Interview scheduled.' });
  })
);

router.put(
  '/:id',
  MANAGE,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const interview = await loadInterview(id);
    const action = String(req.body?.action || '').toLowerCase();

    if (action === 'cancel') {
      if (interview.status === 'cancelled') throw new ApiError(400, 'This interview is already cancelled.');
      await pool.query("UPDATE recruitment_interviews SET status = 'cancelled' WHERE id = ?", [id]);
      const [others] = await pool.query(
        `SELECT COUNT(*) AS count FROM recruitment_interviews
         WHERE application_id = ? AND id <> ? AND status IN ('scheduled','rescheduled')`,
        [interview.application_id, id]
      );
      if (!Number(others[0].count) && interview.application_stage === 'interview_scheduled') {
        await pool.query(
          `UPDATE recruitment_applications SET stage = 'shortlisted', stage_updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [interview.application_id]
        );
      }
      await logActivity(pool, {
        jobId: interview.job_id,
        candidateId: interview.candidate_id,
        applicationId: interview.application_id,
        actor: req.user,
        action: 'interview.cancelled',
        details: { interviewId: id },
      });
      await audit(req, { action: 'recruitment.interview.cancel', entity: 'recruitment_interview', entityId: id, details: null });
      return res.json({ interview: await loadInterview(id), message: 'Interview cancelled.' });
    }

    const data = normaliseSchedule({ ...interview, ...(req.body || {}), scheduled_at: req.body?.scheduled_at || interview.scheduled_at });
    data.interviewer_id = await validateInterviewer(data.interviewer_id);

    if (action === 'complete') {
      await pool.query("UPDATE recruitment_interviews SET status = 'completed' WHERE id = ?", [id]);
      if (['interview_scheduled'].includes(interview.application_stage)) {
        await pool.query(
          `UPDATE recruitment_applications SET stage = 'interview_completed', stage_updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [interview.application_id]
        );
      }
      await logActivity(pool, {
        jobId: interview.job_id,
        candidateId: interview.candidate_id,
        applicationId: interview.application_id,
        actor: req.user,
        action: 'interview.completed',
        details: { interviewId: id },
      });
      await audit(req, { action: 'recruitment.interview.complete', entity: 'recruitment_interview', entityId: id, details: null });
      return res.json({ interview: await loadInterview(id), message: 'Interview marked as completed.' });
    }

    const rescheduled =
      action === 'reschedule' ||
      (req.body?.scheduled_at && new Date(req.body.scheduled_at).getTime() !== new Date(interview.scheduled_at).getTime());

    await pool.query(
      `UPDATE recruitment_interviews SET scheduled_at = ?, duration_minutes = ?, interview_type = ?, mode = ?,
         meeting_link = ?, location = ?, notes = ?, interviewer_id = ?, status = ?
       WHERE id = ?`,
      [
        data.scheduled_at,
        data.duration_minutes,
        data.interview_type,
        data.mode,
        data.meeting_link,
        data.location,
        data.notes ?? interview.notes,
        data.interviewer_id,
        rescheduled ? 'rescheduled' : interview.status,
        id,
      ]
    );
    await logActivity(pool, {
      jobId: interview.job_id,
      candidateId: interview.candidate_id,
      applicationId: interview.application_id,
      actor: req.user,
      action: rescheduled ? 'interview.rescheduled' : 'interview.updated',
      details: { interviewId: id, at: data.scheduled_at },
    });
    await audit(req, {
      action: rescheduled ? 'recruitment.interview.reschedule' : 'recruitment.interview.update',
      entity: 'recruitment_interview',
      entityId: id,
      details: { at: data.scheduled_at },
    });
    res.json({
      interview: await loadInterview(id),
      message: rescheduled ? 'Interview rescheduled.' : 'Interview updated.',
    });
  })
);

router.get(
  '/:id/feedback',
  FEEDBACK_VIEW,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const interview = await loadInterview(id);
    const [rows] = await pool.query(
      `SELECT f.*, u.name AS submitted_by_name FROM recruitment_interview_feedback f
       LEFT JOIN hrm_users u ON u.id = f.submitted_by WHERE f.interview_id = ?`,
      [id]
    );
    res.json({ interview, feedback: rows[0] || null });
  })
);

router.post(
  '/:id/feedback',
  FEEDBACK_MANAGE,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const interview = await loadInterview(id);
    const body = req.body || {};
    const recommendation = String(body.recommendation || '');
    if (!['strong_hire', 'hire', 'hold', 'reject'].includes(recommendation))
      throw new ApiError(400, 'Select a valid hiring recommendation.');

    const rating = (value, label) => {
      if (value === undefined || value === null || value === '') return null;
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 5)
        throw new ApiError(400, `${label} rating must be between 1 and 5.`);
      return n;
    };
    const ratings = {
      technical_rating: rating(body.technical_rating, 'Technical skills'),
      communication_rating: rating(body.communication_rating, 'Communication'),
      problem_solving_rating: rating(body.problem_solving_rating, 'Problem-solving'),
      overall_rating: rating(body.overall_rating, 'Overall'),
    };
    if (!ratings.overall_rating) throw new ApiError(400, 'An overall rating is required.');

    const [existing] = await pool.query(
      'SELECT id FROM recruitment_interview_feedback WHERE interview_id = ?',
      [id]
    );

    if (existing.length) {
      await pool.query(
        `UPDATE recruitment_interview_feedback
         SET technical_rating = ?, communication_rating = ?, problem_solving_rating = ?,
             overall_rating = ?, strengths = ?, weaknesses = ?, notes = ?, recommendation = ?,
             submitted_by = ?
         WHERE interview_id = ?`,
        [
          ratings.technical_rating,
          ratings.communication_rating,
          ratings.problem_solving_rating,
          ratings.overall_rating,
          cleanText(body.strengths, 4000),
          cleanText(body.weaknesses, 4000),
          cleanText(body.notes, 5000),
          recommendation,
          req.user.id,
          id,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO recruitment_interview_feedback
          (interview_id, technical_rating, communication_rating, problem_solving_rating,
           overall_rating, strengths, weaknesses, notes, recommendation, submitted_by)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          ratings.technical_rating,
          ratings.communication_rating,
          ratings.problem_solving_rating,
          ratings.overall_rating,
          cleanText(body.strengths, 4000),
          cleanText(body.weaknesses, 4000),
          cleanText(body.notes, 5000),
          recommendation,
          req.user.id,
        ]
      );
    }

    await pool.query("UPDATE recruitment_interviews SET status = 'completed' WHERE id = ? AND status <> 'cancelled'", [id]);
    if (['interview_scheduled'].includes(interview.application_stage)) {
      await pool.query(
        `UPDATE recruitment_applications SET stage = 'interview_completed', stage_updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [interview.application_id]
      );
    }
    await logActivity(pool, {
      jobId: interview.job_id,
      candidateId: interview.candidate_id,
      applicationId: interview.application_id,
      actor: req.user,
      action: 'interview.feedback_recorded',
      details: { interviewId: id, recommendation, overall: ratings.overall_rating },
    });
    await audit(req, {
      action: 'recruitment.interview.feedback',
      entity: 'recruitment_interview',
      entityId: id,
      details: { recommendation, overall: ratings.overall_rating },
    });

    const [rows] = await pool.query(
      `SELECT f.*, u.name AS submitted_by_name FROM recruitment_interview_feedback f
       LEFT JOIN hrm_users u ON u.id = f.submitted_by WHERE f.interview_id = ?`,
      [id]
    );
    res.json({ feedback: rows[0], interview: await loadInterview(id), message: 'Interview feedback saved.' });
  })
);

export default router;

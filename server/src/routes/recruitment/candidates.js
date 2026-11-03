import { Router } from 'express';
import pool from '../../db.js';
import { asyncHandler, ApiError } from '../../utils.js';
import { authenticate, requireAnyPermission, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../audit.js';
import { uploadResume, resumePath, removeResume } from '../../recruitment-files.js';
import {
  APPLICATION_SELECT,
  activityFor,
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

const CANDIDATE_SELECT = `
  SELECT c.*,
    (SELECT COUNT(*) FROM recruitment_applications a WHERE a.candidate_id = c.id) AS application_count,
    (SELECT MAX(a.stage) FROM recruitment_applications a WHERE a.candidate_id = c.id) AS latest_stage,
    u.name AS created_by_name
  FROM recruitment_candidates c
  LEFT JOIN hrm_users u ON u.id = c.created_by
`;

const FIELDS = [
  'full_name', 'email', 'phone', 'alternate_phone', 'location', 'highest_qualification',
  'total_experience', 'current_company', 'current_designation', 'expected_salary',
  'notice_period', 'skills', 'linkedin_url', 'portfolio_url', 'source',
];

const SOURCES = ['direct', 'referral', 'linkedin', 'website', 'job_board', 'agency', 'campus', 'other'];

function normalise(body, { creating = false } = {}) {
  const out = {};
  for (const field of FIELDS) {
    if (body[field] === undefined) continue;
    let value = body[field];
    if (['total_experience', 'expected_salary'].includes(field))
      value = value === '' || value === null ? null : Number(value);
    else if (['skills', 'highest_qualification'].includes(field)) value = cleanText(value, 3000);
    else if (['linkedin_url', 'portfolio_url'].includes(field)) value = cleanText(value, 300);
    else value = cleanText(value, 200);
    out[field] = value;
  }
  if (creating) {
    if (!out.full_name) throw new ApiError(400, 'Candidate name is required.');
    if (!out.email) throw new ApiError(400, 'Candidate email is required.');
    out.total_experience = out.total_experience ?? 0;
    out.source = out.source || 'direct';
  }
  if (out.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email))
    throw new ApiError(400, 'Please enter a valid email address.');
  if (out.source && !SOURCES.includes(out.source)) throw new ApiError(400, 'Invalid candidate source.');
  if (out.linkedin_url && !/^https?:\/\//i.test(out.linkedin_url))
    throw new ApiError(400, 'LinkedIn URL must start with http:// or https://');
  if (out.portfolio_url && !/^https?:\/\//i.test(out.portfolio_url))
    throw new ApiError(400, 'Portfolio URL must start with http:// or https://');
  return out;
}

async function loadCandidate(id, db = pool) {
  const [rows] = await db.query(`${CANDIDATE_SELECT} WHERE c.id = ?`, [id]);
  if (!rows[0]) throw new ApiError(404, 'Candidate not found.');
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
      where.push('(c.full_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.current_company LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (req.query.source) {
      where.push('c.source = ?');
      params.push(req.query.source);
    }
    if (req.query.job_id) {
      where.push('EXISTS (SELECT 1 FROM recruitment_applications a WHERE a.candidate_id = c.id AND a.job_id = ?)');
      params.push(Number(req.query.job_id));
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[count]] = await pool.query(`SELECT COUNT(*) AS total FROM recruitment_candidates c ${clause}`, params);
    const [rows] = await pool.query(
      `${CANDIDATE_SELECT} ${clause} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json(paginated(rows, count.total, page, limit));
  })
);

router.get(
  '/:id',
  VIEW,
  asyncHandler(async (req, res) => {
    const candidate = await loadCandidate(Number(req.params.id));
    const [applications] = await pool.query(
      `${APPLICATION_SELECT} WHERE a.candidate_id = ? ORDER BY a.applied_at DESC`,
      [candidate.id]
    );
    const canSeeInterviews =
      req.user.role === 'super_admin' ||
      req.permissions.includes('recruitment.interviews.view') ||
      req.permissions.includes('recruitment.interviews.manage');
    let interviews = [];
    if (canSeeInterviews) {
      const [rows] = await pool.query(
        `SELECT i.*, j.title AS job_title, u.name AS interviewer_name,
           f.overall_rating, f.recommendation
         FROM recruitment_interviews i
         JOIN recruitment_applications a ON a.id = i.application_id
         JOIN recruitment_jobs j ON j.id = a.job_id
         LEFT JOIN hrm_users u ON u.id = i.interviewer_id
         LEFT JOIN recruitment_interview_feedback f ON f.interview_id = i.id
         WHERE a.candidate_id = ? ORDER BY i.scheduled_at DESC`,
        [candidate.id]
      );
      interviews = rows;
    }
    res.json({ candidate, applications, interviews });
  })
);

router.post(
  '/',
  MANAGE,
  asyncHandler(async (req, res) => {
    const body = normalise(req.body || {}, { creating: true });
    const jobId = req.body?.job_id ? Number(req.body.job_id) : null;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const columns = Object.keys(body);
      const [result] = await conn.query(
        `INSERT INTO recruitment_candidates (${columns.join(', ')}, created_by)
         VALUES (${columns.map(() => '?').join(', ')}, ?)`,
        [...columns.map((c) => body[c]), req.user.id]
      );

      let application = null;
      if (jobId) {
        const [[job]] = await conn.query(
          'SELECT id, title, status, application_deadline FROM recruitment_jobs WHERE id = ? FOR UPDATE',
          [jobId]
        );
        if (!job) throw new ApiError(404, 'Job vacancy not found.');
        if (job.status !== 'open') throw new ApiError(400, 'Applications are only accepted for open vacancies.');
        if (job.application_deadline && String(job.application_deadline).slice(0, 10) < today())
          throw new ApiError(400, 'The application deadline for this vacancy has passed.');
        const [dup] = await conn.query(
          'SELECT id FROM recruitment_applications WHERE job_id = ? AND candidate_id = ?',
          [jobId, result.insertId]
        );
        if (dup.length) throw new ApiError(409, 'This candidate has already applied for that vacancy.');

        const [appResult] = await conn.query(
          `INSERT INTO recruitment_applications (job_id, candidate_id, stage, created_by)
           VALUES (?, ?, 'applied', ?)`,
          [jobId, result.insertId, req.user.id]
        );
        application = { id: appResult.insertId, job_id: jobId, title: job.title };
        await logActivity(conn, {
          jobId,
          candidateId: result.insertId,
          applicationId: appResult.insertId,
          actor: req.user,
          action: 'application.created',
          details: { source: body.source },
        });
      }
      await conn.commit();

      await audit(req, {
        action: 'recruitment.candidate.create',
        entity: 'recruitment_candidate',
        entityId: result.insertId,
        details: { name: body.full_name, email: body.email, jobId },
      });
      const candidate = await loadCandidate(result.insertId);
      res.status(201).json({
        candidate,
        application,
        message: jobId ? 'Candidate added and registered for the vacancy.' : 'Candidate added.',
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

router.put(
  '/:id',
  MANAGE,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await loadCandidate(id);
    const body = normalise(req.body || {});
    const keys = Object.keys(body);
    if (!keys.length) throw new ApiError(400, 'Nothing to update.');
    await pool.query(
      `UPDATE recruitment_candidates SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
      [...keys.map((k) => body[k]), id]
    );
    await audit(req, { action: 'recruitment.candidate.update', entity: 'recruitment_candidate', entityId: id, details: { fields: keys } });
    res.json({ candidate: await loadCandidate(id), message: 'Candidate updated.' });
  })
);

router.post(
  '/:id/resume',
  MANAGE,
  uploadResume,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!req.file) throw new ApiError(400, 'Please choose a resume file to upload.');
    const candidate = await loadCandidate(id);
    const old = candidate.resume_file;
    await pool.query(
      `UPDATE recruitment_candidates
       SET resume_file = ?, resume_original_name = ?, resume_mime = ? WHERE id = ?`,
      [req.file.filename, req.file.originalname, req.file.mimetype, id]
    );
    removeResume(old);
    await activityFor(req, 'candidate.resume_uploaded', { file: req.file.originalname }, { candidateId: id });
    await audit(req, {
      action: 'recruitment.candidate.resume',
      entity: 'recruitment_candidate',
      entityId: id,
      details: { file: req.file.originalname, size: req.file.size },
    });
    res.json({ candidate: await loadCandidate(id), message: 'Resume uploaded securely.' });
  })
);

router.get(
  '/:id/resume',
  VIEW,
  asyncHandler(async (req, res) => {
    const candidate = await loadCandidate(Number(req.params.id));
    if (!candidate.resume_file) throw new ApiError(404, 'This candidate has no resume on file.');
    const file = resumePath(candidate.resume_file);
    await activityFor(req, 'candidate.resume_downloaded', { file: candidate.resume_original_name }, { candidateId: candidate.id });
    res.download(file, candidate.resume_original_name || 'resume.pdf');
  })
);

router.delete(
  '/:id',
  MANAGE,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const candidate = await loadCandidate(id);
    const [[converted]] = await pool.query(
      'SELECT COUNT(*) AS count FROM recruitment_applications WHERE candidate_id = ? AND converted_employee_id IS NOT NULL',
      [id]
    );
    if (Number(converted.count))
      throw new ApiError(400, 'This candidate has been converted to an employee and cannot be deleted.');
    await pool.query('DELETE FROM recruitment_candidates WHERE id = ?', [id]);
    removeResume(candidate.resume_file);
    await audit(req, { action: 'recruitment.candidate.delete', entity: 'recruitment_candidate', entityId: id, details: { name: candidate.full_name } });
    res.json({ message: 'Candidate removed.' });
  })
);

export default router;

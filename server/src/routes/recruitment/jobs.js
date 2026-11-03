import { Router } from 'express';
import pool from '../../db.js';
import { asyncHandler, ApiError } from '../../utils.js';
import { authenticate, requireAnyPermission, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../audit.js';
import { activityFor, cleanText, pageParams, paginated, toIsoDate } from '../../recruitment-utils.js';

const router = Router();
router.use(authenticate);

const VIEW = requireAnyPermission('recruitment.jobs.view', 'recruitment.jobs.manage');
const MANAGE = requirePermission('recruitment.jobs.manage');

const JOB_SELECT = `
  SELECT j.*, d.name AS department_name, d.color AS department_color,
    CONCAT(u.name) AS created_by_name,
    (SELECT COUNT(*) FROM recruitment_applications a WHERE a.job_id = j.id) AS application_count,
    (SELECT COUNT(*) FROM recruitment_applications a WHERE a.job_id = j.id AND a.stage = 'hired') AS hired_count
  FROM recruitment_jobs j
  LEFT JOIN hrm_departments d ON d.id = j.department_id
  LEFT JOIN hrm_users u ON u.id = j.created_by
`;

const FIELDS = [
  'title', 'job_code', 'department_id', 'employment_type', 'work_location', 'work_mode',
  'experience_min', 'experience_max', 'salary_min', 'salary_max', 'vacancies',
  'description', 'responsibilities', 'qualifications', 'skills', 'application_deadline', 'status',
];

const ENUMS = {
  employment_type: ['full-time', 'part-time', 'contract', 'intern'],
  work_mode: ['on-site', 'remote', 'hybrid'],
  status: ['draft', 'open', 'on-hold', 'closed'],
};

function normalise(body, { creating = false } = {}) {
  const out = {};
  for (const field of FIELDS) {
    if (body[field] === undefined) continue;
    let value = body[field];
    if (field === 'department_id') value = value === '' || value === null ? null : Number(value) || null;
    else if (['experience_min', 'experience_max'].includes(field))
      value = value === '' || value === null ? null : Number(value);
    else if (['salary_min', 'salary_max'].includes(field))
      value = value === '' || value === null ? null : Number(value);
    else if (field === 'vacancies') value = value === '' || value === null ? 1 : Math.max(1, Number(value) || 1);
    else if (field === 'application_deadline') value = toIsoDate(value);
    else if (field === 'job_code') value = cleanText(value, 30);
    else if (['description', 'responsibilities', 'qualifications'].includes(field)) value = cleanText(value, 8000);
    else if (field === 'skills') value = cleanText(value, 3000);
    else value = cleanText(value, 200);

    if (ENUMS[field] && value && !ENUMS[field].includes(value))
      throw new ApiError(400, `Invalid ${field.replace('_', ' ')}.`);
    out[field] = value;
  }

  if (creating) {
    if (!out.title) throw new ApiError(400, 'Job title is required.');
    out.employment_type = out.employment_type || 'full-time';
    out.work_mode = out.work_mode || 'on-site';
    out.vacancies = out.vacancies || 1;
    out.experience_min = out.experience_min ?? 0;
    out.status = out.status || 'draft';
  }

  if (out.experience_min != null && out.experience_max != null && Number(out.experience_max) < Number(out.experience_min))
    throw new ApiError(400, 'Maximum experience cannot be lower than minimum experience.');
  if (out.salary_min != null && out.salary_max != null && Number(out.salary_max) < Number(out.salary_min))
    throw new ApiError(400, 'Maximum salary cannot be lower than minimum salary.');

  return out;
}

async function nextJobCode(db = pool) {
  const year = new Date().getFullYear();
  const prefix = `JOB-${year}-`;
  const [[row]] = await db.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(job_code, ?) AS UNSIGNED)), 0) AS maxCode
     FROM recruitment_jobs WHERE job_code LIKE ?`,
    [prefix.length + 1, `${prefix}%`]
  );
  return `${prefix}${String(Number(row.maxCode) + 1).padStart(4, '0')}`;
}

async function loadJob(id) {
  const [rows] = await pool.query(`${JOB_SELECT} WHERE j.id = ?`, [id]);
  if (!rows[0]) throw new ApiError(404, 'Job vacancy not found.');
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
      where.push('(j.title LIKE ? OR j.job_code LIKE ? OR j.work_location LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (req.query.status) {
      where.push('j.status = ?');
      params.push(req.query.status);
    }
    if (req.query.department_id) {
      where.push('j.department_id = ?');
      params.push(Number(req.query.department_id));
    }
    if (req.query.employment_type) {
      where.push('j.employment_type = ?');
      params.push(req.query.employment_type);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[count]] = await pool.query(`SELECT COUNT(*) AS total FROM recruitment_jobs j ${clause}`, params);
    const [rows] = await pool.query(
      `${JOB_SELECT} ${clause} ORDER BY FIELD(j.status,'open','on-hold','draft','closed'), j.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json(paginated(rows, count.total, page, limit));
  })
);

router.get(
  '/options',
  VIEW,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT j.id, j.job_code, j.title, j.status, j.department_id, j.application_deadline,
              d.name AS department_name
       FROM recruitment_jobs j LEFT JOIN hrm_departments d ON d.id = j.department_id
       ORDER BY FIELD(j.status,'open','on-hold','draft','closed'), j.title`
    );
    res.json({ data: rows });
  })
);

router.get(
  '/:id',
  VIEW,
  asyncHandler(async (req, res) => {
    const job = await loadJob(Number(req.params.id));
    const [applications] = await pool.query(
      `SELECT a.id, a.stage, a.applied_at, c.id AS candidate_id, c.full_name, c.email, c.phone, c.source
       FROM recruitment_applications a JOIN recruitment_candidates c ON c.id = a.candidate_id
       WHERE a.job_id = ? ORDER BY a.applied_at DESC LIMIT 100`,
      [job.id]
    );
    res.json({ job, applications });
  })
);

router.post(
  '/',
  MANAGE,
  asyncHandler(async (req, res) => {
    const body = normalise(req.body || {}, { creating: true });
    const jobCode = body.job_code || (await nextJobCode());
    delete body.job_code;

    const columns = Object.keys(body);
    const [result] = await pool.query(
      `INSERT INTO recruitment_jobs (job_code, ${columns.join(', ')}, created_by)
       VALUES (?, ${columns.map(() => '?').join(', ')}, ?)`,
      [jobCode, ...columns.map((c) => body[c]), req.user.id]
    );
    const job = await loadJob(result.insertId);
    await activityFor(req, 'job.created', { title: job.title, job_code: jobCode }, { jobId: job.id });
    await audit(req, { action: 'recruitment.job.create', entity: 'recruitment_job', entityId: job.id, details: { title: job.title, code: jobCode } });
    res.status(201).json({ job, message: 'Job vacancy created.' });
  })
);

router.put(
  '/:id',
  MANAGE,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const current = await loadJob(id);
    const body = normalise(req.body || {});
    if (body.status === 'open' && !current.title && !body.title)
      throw new ApiError(400, 'A title is required before publishing.');
    const keys = Object.keys(body);
    if (!keys.length) throw new ApiError(400, 'Nothing to update.');
    await pool.query(
      `UPDATE recruitment_jobs SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
      [...keys.map((k) => body[k]), id]
    );
    const job = await loadJob(id);
    await activityFor(req, 'job.updated', { fields: keys }, { jobId: id });
    await audit(req, { action: 'recruitment.job.update', entity: 'recruitment_job', entityId: id, details: { fields: keys } });
    res.json({ job, message: 'Job vacancy updated.' });
  })
);

router.patch(
  '/:id/status',
  MANAGE,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const job = await loadJob(id);
    const action = String(req.body?.action || '').toLowerCase();
    const map = {
      publish: 'open',
      open: 'open',
      close: 'closed',
      reopen: 'open',
      hold: 'on-hold',
      draft: 'draft',
    };
    const next = map[action] || req.body?.status;
    if (!ENUMS.status.includes(next)) throw new ApiError(400, 'Invalid job status.');
    if (action === 'publish' && job.status !== 'draft' && job.status !== 'on-hold')
      throw new ApiError(400, 'Only draft or on-hold vacancies can be published.');
    if (action === 'reopen' && job.status !== 'closed')
      throw new ApiError(400, 'Only closed vacancies can be reopened.');
    if (next === 'open' && job.application_deadline && String(job.application_deadline).slice(0, 10) < new Date().toISOString().slice(0, 10))
      throw new ApiError(400, 'Update the application deadline before reopening this vacancy.');

    await pool.query('UPDATE recruitment_jobs SET status = ? WHERE id = ?', [next, id]);
    await activityFor(req, `job.${action || 'status'}`, { from: job.status, to: next }, { jobId: id });
    await audit(req, { action: 'recruitment.job.status', entity: 'recruitment_job', entityId: id, details: { from: job.status, to: next } });
    res.json({ job: await loadJob(id), message: `Vacancy is now ${next}.` });
  })
);

router.delete(
  '/:id',
  MANAGE,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const job = await loadJob(id);
    if (job.status !== 'draft')
      throw new ApiError(400, 'Only draft vacancies can be deleted. Close this vacancy instead.');
    if (Number(job.application_count))
      throw new ApiError(400, 'This vacancy already has applications and cannot be deleted.');
    await pool.query('DELETE FROM recruitment_jobs WHERE id = ?', [id]);
    await audit(req, { action: 'recruitment.job.delete', entity: 'recruitment_job', entityId: id, details: { title: job.title } });
    res.json({ message: 'Job vacancy deleted.' });
  })
);

export default router;

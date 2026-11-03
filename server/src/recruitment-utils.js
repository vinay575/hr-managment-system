import pool from './db.js';

/** Pipeline stages, in order. */
export const STAGES = [
  'applied',
  'screening',
  'shortlisted',
  'interview_scheduled',
  'interview_completed',
  'selected',
  'offer_sent',
  'hired',
  'rejected',
];

/**
 * Allowed pipeline transitions. The API is the single authority: the frontend
 * only offers actions, this map decides whether they are legal.
 */
export const STAGE_TRANSITIONS = {
  applied: ['screening', 'rejected'],
  screening: ['shortlisted', 'rejected'],
  shortlisted: ['interview_scheduled', 'rejected'],
  interview_scheduled: ['interview_completed', 'shortlisted', 'rejected'],
  interview_completed: ['selected', 'shortlisted', 'rejected'],
  selected: ['offer_sent', 'rejected'],
  offer_sent: ['hired', 'rejected'],
  hired: [],
  rejected: [],
};

export const STAGE_LABELS = {
  applied: 'Applied',
  screening: 'Screening',
  shortlisted: 'Shortlisted',
  interview_scheduled: 'Interview scheduled',
  interview_completed: 'Interview completed',
  selected: 'Selected',
  offer_sent: 'Offer sent',
  hired: 'Hired',
  rejected: 'Rejected',
};

export const INTERVIEW_TYPES = ['technical', 'hr', 'managerial', 'final'];
export const INTERVIEW_MODES = ['online', 'offline', 'phone'];
export const OFFER_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'withdrawn'];

export function canTransition(from, to) {
  return (STAGE_TRANSITIONS[from] || []).includes(to);
}

/** Append a recruitment activity row. Never breaks the caller. */
export async function logActivity(
  db,
  { jobId = null, candidateId = null, applicationId = null, actor = null, action, details = null }
) {
  try {
    await db.query(
      `INSERT INTO recruitment_activity_logs
        (job_id, candidate_id, application_id, actor_id, actor_name, action, details)
       VALUES (?,?,?,?,?,?,?)`,
      [
        jobId,
        candidateId,
        applicationId,
        actor?.id || null,
        actor?.name || 'System',
        action,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (err) {
    console.error('Recruitment activity log failed:', err.message);
  }
}

export const activityFor = (req, action, details, ids = {}) =>
  logActivity(pool, { ...ids, actor: req.user, action, details });

export function pageParams(query, defaultLimit = 10, maxLimit = 100) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

export function paginated(rows, total, page, limit) {
  return { data: rows, total: Number(total) || 0, page, limit, pages: Math.ceil((Number(total) || 0) / limit) || 1 };
}

export function cleanText(value, max = 5000) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

export function toIsoDate(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Standard application row shape used by pipeline and detail endpoints. */
export const APPLICATION_SELECT = `
  SELECT a.*,
    c.full_name AS candidate_name, c.email AS candidate_email, c.phone AS candidate_phone,
    c.location AS candidate_location, c.total_experience, c.current_company,
    c.current_designation, c.resume_file, c.resume_original_name, c.source,
    j.title AS job_title, j.job_code, j.department_id, j.employment_type, j.work_mode,
    j.work_location, d.name AS department_name, d.color AS department_color,
    e.employee_code AS converted_employee_code,
    CONCAT(e.first_name,' ',e.last_name) AS converted_employee_name
  FROM recruitment_applications a
  JOIN recruitment_candidates c ON c.id = a.candidate_id
  JOIN recruitment_jobs j ON j.id = a.job_id
  LEFT JOIN hrm_departments d ON d.id = j.department_id
  LEFT JOIN hrm_employees e ON e.id = a.converted_employee_id
`;

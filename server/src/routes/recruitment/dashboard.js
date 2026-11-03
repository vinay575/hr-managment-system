import { Router } from 'express';
import pool from '../../db.js';
import { asyncHandler } from '../../utils.js';
import { authenticate, requireAnyPermission } from '../../middleware/auth.js';
import { STAGE_LABELS } from '../../recruitment-utils.js';

const router = Router();
router.use(authenticate);

const DASHBOARD = requireAnyPermission('recruitment.view', 'recruitment.reports.view');

const num = (v) => Number(v) || 0;

router.get(
  '/',
  DASHBOARD,
  asyncHandler(async (req, res) => {
    const can = (p) => req.user.role === 'super_admin' || req.permissions.includes(p);
    const canCandidates = can('recruitment.candidates.view') || can('recruitment.candidates.manage');
    const canInterviews = can('recruitment.interviews.view') || can('recruitment.interviews.manage');
    const canOffers = can('recruitment.offers.view') || can('recruitment.offers.manage');

    const [[jobStats]] = await pool.query(
      `SELECT COUNT(*) AS total_jobs,
              SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_jobs,
              COALESCE(SUM(CASE WHEN status = 'open' THEN vacancies ELSE 0 END), 0) AS open_positions,
              SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft_jobs,
              SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_jobs
       FROM recruitment_jobs`
    );
    const [[candidateStats]] = await pool.query('SELECT COUNT(*) AS total_candidates FROM recruitment_candidates');
    const [[stageStats]] = await pool.query(
      `SELECT
        SUM(CASE WHEN stage = 'screening' THEN 1 ELSE 0 END) AS screening,
        SUM(CASE WHEN stage = 'shortlisted' THEN 1 ELSE 0 END) AS shortlisted,
        SUM(CASE WHEN stage = 'selected' THEN 1 ELSE 0 END) AS selected,
        SUM(CASE WHEN stage = 'hired' THEN 1 ELSE 0 END) AS hired,
        COUNT(*) AS applications
       FROM recruitment_applications`
    );
    const [[interviewStats]] = await pool.query(
      `SELECT
        SUM(CASE WHEN status IN ('scheduled','rescheduled') AND scheduled_at >= NOW() THEN 1 ELSE 0 END) AS upcoming,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM recruitment_interviews`
    );
    const [[offerStats]] = await pool.query(
      `SELECT
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,
        COUNT(*) AS total
       FROM recruitment_offers`
    );

    const [funnelRows] = await pool.query(
      `SELECT stage, COUNT(*) AS count FROM recruitment_applications GROUP BY stage`
    );
    const funnel = Object.entries(STAGE_LABELS)
      .filter(([stage]) => stage !== 'rejected')
      .map(([stage, label]) => ({
        stage,
        label,
        count: num(funnelRows.find((r) => r.stage === stage)?.count),
      }));

    const [monthlyHiring] = await pool.query(
      `SELECT DATE_FORMAT(converted_at, '%Y-%m') AS month, COUNT(*) AS hires
       FROM recruitment_applications
       WHERE converted_at IS NOT NULL AND converted_at >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
       GROUP BY month ORDER BY month`
    );
    const [monthlyApplications] = await pool.query(
      `SELECT DATE_FORMAT(applied_at, '%Y-%m') AS month, COUNT(*) AS applications
       FROM recruitment_applications
       WHERE applied_at >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
       GROUP BY month ORDER BY month`
    );
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        month: key,
        hires: num(monthlyHiring.find((r) => r.month === key)?.hires),
        applications: num(monthlyApplications.find((r) => r.month === key)?.applications),
      });
    }

    const [departmentVacancies] = await pool.query(
      `SELECT COALESCE(d.name, 'Unassigned') AS department, COUNT(j.id) AS jobs,
              COALESCE(SUM(j.vacancies), 0) AS vacancies
       FROM recruitment_jobs j LEFT JOIN hrm_departments d ON d.id = j.department_id
       WHERE j.status IN ('open','on-hold')
       GROUP BY department ORDER BY vacancies DESC LIMIT 10`
    );

    const [sources] = await pool.query(
      `SELECT c.source, COUNT(DISTINCT a.id) AS applications,
              SUM(CASE WHEN a.stage = 'hired' THEN 1 ELSE 0 END) AS hires
       FROM recruitment_applications a JOIN recruitment_candidates c ON c.id = a.candidate_id
       GROUP BY c.source ORDER BY applications DESC`
    );

    const applications = num(stageStats.applications);
    const hired = num(stageStats.hired);
    const conversionRate = applications ? Math.round((hired / applications) * 1000) / 10 : 0;

    let recentApplications = [];
    if (canCandidates) {
      const [rows] = await pool.query(
        `SELECT a.id, a.stage, a.applied_at, c.id AS candidate_id, c.full_name, c.email, c.source,
                j.title AS job_title, j.job_code
         FROM recruitment_applications a
         JOIN recruitment_candidates c ON c.id = a.candidate_id
         JOIN recruitment_jobs j ON j.id = a.job_id
         ORDER BY a.applied_at DESC LIMIT 6`
      );
      recentApplications = rows;
    }

    let upcomingInterviews = [];
    if (canInterviews) {
      const [rows] = await pool.query(
        `SELECT i.id, i.scheduled_at, i.interview_type, i.mode, i.status,
                c.full_name AS candidate_name, j.title AS job_title, u.name AS interviewer_name
         FROM recruitment_interviews i
         JOIN recruitment_applications a ON a.id = i.application_id
         JOIN recruitment_candidates c ON c.id = a.candidate_id
         JOIN recruitment_jobs j ON j.id = a.job_id
         LEFT JOIN hrm_users u ON u.id = i.interviewer_id
         WHERE i.status IN ('scheduled','rescheduled') AND i.scheduled_at >= NOW()
         ORDER BY i.scheduled_at LIMIT 6`
      );
      upcomingInterviews = rows;
    }

    let recentHires = [];
    if (canCandidates || can('recruitment.hire')) {
      const [rows] = await pool.query(
        `SELECT a.id, a.converted_at, c.full_name AS candidate_name, j.title AS job_title,
                e.id AS employee_id, e.employee_code, e.join_date,
                CONCAT(e.first_name,' ',e.last_name) AS employee_name
         FROM recruitment_applications a
         JOIN recruitment_candidates c ON c.id = a.candidate_id
         JOIN recruitment_jobs j ON j.id = a.job_id
         LEFT JOIN hrm_employees e ON e.id = a.converted_employee_id
         WHERE a.converted_employee_id IS NOT NULL
         ORDER BY a.converted_at DESC LIMIT 5`
      );
      recentHires = rows;
    }

    let activities = [];
    if (canCandidates) {
      const [rows] = await pool.query(
        `SELECT l.id, l.action, l.actor_name, l.created_at, l.details,
                c.full_name AS candidate_name, j.title AS job_title
         FROM recruitment_activity_logs l
         LEFT JOIN recruitment_candidates c ON c.id = l.candidate_id
         LEFT JOIN recruitment_jobs j ON j.id = l.job_id
         ORDER BY l.created_at DESC LIMIT 8`
      );
      activities = rows;
    }

    res.json({
      stats: {
        totalJobs: num(jobStats.total_jobs),
        openJobs: num(jobStats.open_jobs),
        openPositions: num(jobStats.open_positions),
        draftJobs: num(jobStats.draft_jobs),
        closedJobs: num(jobStats.closed_jobs),
        totalCandidates: num(candidateStats.total_candidates),
        screening: num(stageStats.screening),
        shortlisted: num(stageStats.shortlisted),
        upcomingInterviews: num(interviewStats.upcoming),
        completedInterviews: num(interviewStats.completed),
        selected: num(stageStats.selected),
        offersSent: num(offerStats.sent),
        offersAccepted: num(offerStats.accepted),
        hired,
        applications,
        conversionRate,
      },
      funnel,
      monthlyTrends: months,
      departmentVacancies,
      sources,
      recentApplications,
      upcomingInterviews,
      recentHires,
      activities,
      visibility: { candidates: canCandidates, interviews: canInterviews, offers: canOffers },
    });
  })
);

export default router;

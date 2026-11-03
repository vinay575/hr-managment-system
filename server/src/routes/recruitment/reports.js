import { Router } from 'express';
import pool from '../../db.js';
import { asyncHandler } from '../../utils.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { STAGE_LABELS } from '../../recruitment-utils.js';

const router = Router();
router.use(authenticate);

const num = (v) => Number(v) || 0;

router.get(
  '/',
  requirePermission('recruitment.reports.view'),
  asyncHandler(async (req, res) => {
    const [stageRows] = await pool.query(
      'SELECT stage, COUNT(*) AS count FROM recruitment_applications GROUP BY stage'
    );
    const counts = Object.fromEntries(stageRows.map((r) => [r.stage, num(r.count)]));
    const totalApplications = stageRows.reduce((sum, r) => sum + num(r.count), 0);
    const hired = counts.hired || 0;

    const funnel = Object.entries(STAGE_LABELS)
      .filter(([stage]) => stage !== 'rejected')
      .map(([stage, label]) => ({
        stage,
        label,
        count: counts[stage] || 0,
        share: totalApplications ? Math.round(((counts[stage] || 0) / totalApplications) * 1000) / 10 : 0,
      }));

    const [monthly] = await pool.query(
      `SELECT DATE_FORMAT(applied_at, '%Y-%m') AS month,
              COUNT(*) AS applications,
              SUM(CASE WHEN stage = 'hired' THEN 1 ELSE 0 END) AS hires
       FROM recruitment_applications
       WHERE applied_at >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
       GROUP BY month ORDER BY month`
    );
    const now = new Date();
    const trend = [];
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const row = monthly.find((m) => m.month === key);
      trend.push({ month: key, applications: num(row?.applications), hires: num(row?.hires) });
    }

    const [departments] = await pool.query(
      `SELECT COALESCE(d.name, 'Unassigned') AS department,
              COUNT(DISTINCT j.id) AS jobs,
              COALESCE(SUM(j.vacancies), 0) AS vacancies,
              COUNT(a.id) AS applications,
              SUM(CASE WHEN a.stage = 'hired' THEN 1 ELSE 0 END) AS hires
       FROM recruitment_jobs j
       LEFT JOIN hrm_departments d ON d.id = j.department_id
       LEFT JOIN recruitment_applications a ON a.job_id = j.id
       GROUP BY department ORDER BY applications DESC`
    );

    const [sources] = await pool.query(
      `SELECT c.source,
              COUNT(a.id) AS applications,
              SUM(CASE WHEN a.stage = 'hired' THEN 1 ELSE 0 END) AS hires
       FROM recruitment_candidates c
       LEFT JOIN recruitment_applications a ON a.candidate_id = c.id
       GROUP BY c.source ORDER BY applications DESC`
    );
    const sourceReport = sources.map((s) => ({
      source: s.source,
      applications: num(s.applications),
      hires: num(s.hires),
      conversion: num(s.applications) ? Math.round((num(s.hires) / num(s.applications)) * 1000) / 10 : 0,
    }));

    const canViewPayroll = req.permissions.includes('payroll.view_all');
    const [offerRows] = await pool.query(
      `SELECT status, COUNT(*) AS count${canViewPayroll ? ', COALESCE(AVG(annual_salary),0) AS average_salary' : ''}
       FROM recruitment_offers GROUP BY status`
    );
    const offers = offerRows.map((o) => ({
      status: o.status,
      count: num(o.count),
      ...(canViewPayroll ? { averageSalary: num(o.average_salary) } : {}),
    }));

    const [[timeToHire]] = await pool.query(
      `SELECT COALESCE(AVG(DATEDIFF(converted_at, applied_at)), 0) AS days
       FROM recruitment_applications WHERE converted_at IS NOT NULL`
    );

    const [jobStats] = await pool.query(
      `SELECT status, COUNT(*) AS count FROM recruitment_jobs GROUP BY status`
    );

    const [[totals]] = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM recruitment_jobs) AS jobs,
        (SELECT COUNT(*) FROM recruitment_candidates) AS candidates,
        (SELECT COUNT(*) FROM recruitment_interviews) AS interviews,
        (SELECT COUNT(*) FROM recruitment_offers) AS offers,
        (SELECT COUNT(*) FROM hrm_employees WHERE join_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)) AS recentEmployees`
    );

    const rejected = counts.rejected || 0;
    const stageConversion = funnel
      .filter((f) => !['applied', 'rejected'].includes(f.stage))
      .map((f) => ({
        stage: f.stage,
        label: f.label,
        count: f.count,
        fromApplied: totalApplications ? Math.round((f.count / totalApplications) * 1000) / 10 : 0,
        fromHired: f.count ? Math.round((hired / f.count) * 1000) / 10 : 0,
      }));

    res.json({
      totals: {
        applications: totalApplications,
        candidates: num(totals.candidates),
        jobs: num(totals.jobs),
        interviews: num(totals.interviews),
        offers: num(totals.offers),
        hired,
        rejected,
        conversionRate: totalApplications ? Math.round((hired / totalApplications) * 1000) / 10 : 0,
        averageTimeToHire: Math.round(num(timeToHire.days) * 10) / 10,
      },
      funnel,
      trend,
      departments,
      sources: sourceReport,
      offers,
      jobsByStatus: Object.fromEntries(jobStats.map((j) => [j.status, num(j.count)])),
      stageConversion,
      generatedAt: new Date().toISOString(),
    });
  })
);

export default router;

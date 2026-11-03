import pool from './db.js';

async function seedTestCandidate() {
  const [jobRes] = await pool.query(
    `INSERT INTO recruitment_jobs
      (job_code, title, employment_type, work_location, status, created_by)
     VALUES ('JOB-2026-001', 'Senior Full Stack Engineer', 'full-time', 'Headquarters', 'open', 1)`
  );
  const jobId = jobRes.insertId;

  const [candRes] = await pool.query(
    `INSERT INTO recruitment_candidates
      (full_name, email, phone, location, highest_qualification, total_experience, current_designation, source, created_by)
     VALUES ('Marcus Vance', 'marcus.vance@aurorahr.internal', '+1 (555) 234-5678', 'San Francisco, CA', 'M.S. Software Engineering', 5.5, 'Software Engineer', 'LinkedIn', 1)`
  );
  const candId = candRes.insertId;

  const [appRes] = await pool.query(
    `INSERT INTO recruitment_applications
      (job_id, candidate_id, stage, created_by)
     VALUES (?, ?, 'selected', 1)`,
    [jobId, candId]
  );
  const appId = appRes.insertId;

  const [offRes] = await pool.query(
    `INSERT INTO recruitment_offers
      (application_id, offer_number, job_title, annual_salary, joining_date, employment_type, status, created_by)
     VALUES (?, 'OFF-2026-0001', 'Senior Full Stack Engineer', 125000, DATE_ADD(CURDATE(), INTERVAL 14 DAY), 'full-time', 'sent', 1)`,
    [appId]
  );
  const offId = offRes.insertId;

  console.log('Created candidate Marcus Vance:', { candId, appId, offId });
  process.exit(0);
}

seedTestCandidate().catch((err) => {
  console.error(err);
  process.exit(1);
});


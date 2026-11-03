import pool from './db.js';

async function seedHRTestData() {
  console.log('Seeding rich test data for HR verification...');

  // 1. Ensure a selected candidate and an offer
  const [apps] = await pool.query(`
    SELECT a.id AS application_id, a.candidate_id, a.job_id, c.full_name, c.email, j.title, j.department_id
    FROM recruitment_applications a
    JOIN recruitment_candidates c ON c.id = a.candidate_id
    JOIN recruitment_jobs j ON j.id = a.job_id
    LIMIT 1
  `);

  if (apps.length > 0) {
    const app = apps[0];
    await pool.query("UPDATE recruitment_applications SET stage = 'selected' WHERE id = ?", [app.application_id]);

    const [existingOffer] = await pool.query('SELECT id FROM recruitment_offers WHERE application_id = ?', [app.application_id]);
    if (existingOffer.length === 0) {
      await pool.query(
        `INSERT INTO recruitment_offers
          (application_id, offer_number, job_title, department_id, annual_salary, joining_date, probation_months, employment_type, status, created_by)
         VALUES (?, 'OFF-2026-0001', ?, ?, 98000, DATE_ADD(CURDATE(), INTERVAL 15 DAY), 3, 'full-time', 'draft', 4)`,
        [app.application_id, app.title, app.department_id]
      );
      console.log('✓ Seeded draft offer OFF-2026-0001 for candidate', app.full_name);
    }
  }

  // 2. Ensure an employee resignation for review
  const [existingResig] = await pool.query('SELECT id FROM employee_resignations LIMIT 1');
  if (existingResig.length === 0) {
    const [resResult] = await pool.query(
      `INSERT INTO employee_resignations
        (employee_id, resignation_date, proposed_last_working_day, reason, comments, status)
       VALUES (1, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), 'Higher Education & Career Growth', 'Transition handover planned.', 'pending')`
    );
    await pool.query(
      `INSERT INTO notice_period_records
        (resignation_id, employee_id, notice_duration_days, submission_date, expected_lwd, status)
       VALUES (?, 1, 30, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), 'serving')`,
      [resResult.insertId]
    );
    console.log('✓ Seeded pending resignation and notice period for Sarah Chen');
  }

  // 3. Ensure a sample document submitted for verification
  const [onbRecords] = await pool.query('SELECT id FROM onboarding_records WHERE employee_id = 1 LIMIT 1');
  if (onbRecords.length > 0) {
    const onbId = onbRecords[0].id;
    const [existingDoc] = await pool.query('SELECT id FROM onboarding_documents WHERE onboarding_id = ?', [onbId]);
    if (existingDoc.length === 0) {
      await pool.query(
        `INSERT INTO onboarding_documents
          (onboarding_id, doc_type, title, file_path, original_filename, file_size, mime_type, status)
         VALUES (?, 'identity_proof', 'Passport Document', 'sample-passport.pdf', 'passport_scan.pdf', 102400, 'application/pdf', 'submitted')`,
        [onbId]
      );
      console.log('✓ Seeded submitted onboarding document for verification');
    }
  }

  console.log('HR test data readiness complete.');
  process.exit(0);
}

seedHRTestData().catch((err) => {
  console.error(err);
  process.exit(1);
});


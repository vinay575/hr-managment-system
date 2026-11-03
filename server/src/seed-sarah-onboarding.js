import pool from './db.js';

async function seedSarahOnboarding() {
  const [empRows] = await pool.query('SELECT * FROM hrm_employees WHERE id = 1');
  const emp = empRows[0];
  if (!emp) {
    console.log('Employee id 1 not found');
    process.exit(1);
  }

  const [existing] = await pool.query('SELECT id FROM onboarding_records WHERE employee_id = 1');
  if (existing.length > 0) {
    console.log('Sarah Chen already has an onboarding record:', existing[0].id);
    process.exit(0);
  }

  const [[tpl]] = await pool.query('SELECT * FROM onboarding_templates LIMIT 1');
  if (!tpl) {
    console.log('No onboarding templates found');
    process.exit(1);
  }

  const [res] = await pool.query(
    `INSERT INTO onboarding_records
      (employee_id, joining_date, designation, department_id, employment_type, work_location, template_id, status, progress_percent)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'in_progress', 20)`,
    [
      emp.id,
      emp.join_date || '2025-01-15',
      emp.designation || 'Senior Software Engineer',
      emp.department_id,
      emp.employment_type || 'full-time',
      'Headquarters',
      tpl.id,
    ]
  );

  const onbId = res.insertId;
  const [tasks] = await pool.query('SELECT * FROM onboarding_template_tasks WHERE template_id = ?', [tpl.id]);
  for (const t of tasks) {
    await pool.query(
      `INSERT INTO onboarding_tasks
        (onboarding_id, title, description, category, assigned_role, due_date, status, is_mandatory, sort_order)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL ? DAY), 'pending', ?, ?)`,
      [onbId, t.title, t.description, t.category, t.assigned_role, t.due_days, t.is_mandatory, t.sort_order]
    );
  }

  console.log('Successfully created demo onboarding record for Sarah Chen:', onbId);
  process.exit(0);
}

seedSarahOnboarding().catch((e) => {
  console.error(e);
  process.exit(1);
});


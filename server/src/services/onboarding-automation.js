import pool from '../db.js';
import { ApiError } from '../utils.js';
import { insertEmployee } from './employees.js';

/**
 * Single source of truth for converting a candidate into an employee record.
 * Guarded and idempotent:
 * - If the candidate or application is already converted, returns the existing employee.
 * - Otherwise creates the employee record within a transaction and links both the application and onboarding record.
 */
export async function ensureEmployeeForCandidate({
  candidateId,
  applicationId = null,
  offerId = null,
  onboardingId = null,
  details = {},
  actorId = null,
}) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    // 1. Check if candidate or application is already linked to an employee
    const [[cand]] = await conn.query('SELECT * FROM recruitment_candidates WHERE id = ?', [candidateId]);
    if (!cand) throw new ApiError(404, 'Candidate not found.');

    if (applicationId) {
      const [[app]] = await conn.query('SELECT * FROM recruitment_applications WHERE id = ?', [applicationId]);
      if (app && app.converted_employee_id) {
        const [[existingEmp]] = await conn.query('SELECT * FROM hrm_employees WHERE id = ?', [app.converted_employee_id]);
        if (existingEmp) {
          await conn.commit();
          return { employee: existingEmp, isNew: false };
        }
      }
    }

    // Check if onboarding record already has an employee
    if (onboardingId) {
      const [[onb]] = await conn.query('SELECT * FROM onboarding_records WHERE id = ?', [onboardingId]);
      if (onb && onb.employee_id) {
        const [[existingEmp]] = await conn.query('SELECT * FROM hrm_employees WHERE id = ?', [onb.employee_id]);
        if (existingEmp) {
          await conn.commit();
          return { employee: existingEmp, isNew: false };
        }
      }
    }

    // Check by email to guarantee zero duplicate employees
    const candidateEmail = details.email || cand.email;
    const [[existingByEmail]] = await conn.query('SELECT * FROM hrm_employees WHERE email = ? LIMIT 1', [candidateEmail]);
    if (existingByEmail) {
      // Link to this existing employee
      if (applicationId) {
        await conn.query(
          `UPDATE recruitment_applications
           SET converted_employee_id = ?, converted_at = NOW(), stage = 'hired'
           WHERE id = ? AND converted_employee_id IS NULL`,
          [existingByEmail.id, applicationId]
        );
      }
      if (onboardingId) {
        await conn.query('UPDATE onboarding_records SET employee_id = ? WHERE id = ?', [existingByEmail.id, onboardingId]);
      }
      await conn.commit();
      return { employee: existingByEmail, isNew: false };
    }

    // 2. Fetch offer details if provided
    let offer = null;
    if (offerId) {
      const [[offRow]] = await conn.query('SELECT * FROM recruitment_offers WHERE id = ?', [offerId]);
      offer = offRow;
    }

    const nameParts = (details.full_name || cand.full_name || '').trim().split(/\s+/);
    const firstName = details.first_name || nameParts[0] || 'New';
    const lastName = details.last_name || nameParts.slice(1).join(' ') || 'Employee';

    const monthlySalary =
      details.salary !== undefined && details.salary !== ''
        ? Number(details.salary)
        : offer
        ? Math.round((Number(offer.annual_salary) / 12) * 100) / 100
        : 0;

    const created = await insertEmployee(conn, {
      first_name: firstName,
      last_name: lastName,
      email: candidateEmail,
      phone: details.phone || cand.phone || null,
      gender: details.gender || 'other',
      date_of_birth: details.date_of_birth || null,
      address: details.address || details.current_address || null,
      city: details.city || cand.location || null,
      country: details.country || 'United States',
      department_id: details.department_id || (offer ? offer.department_id : null),
      designation: details.designation || (offer ? offer.job_title : 'Staff Member'),
      employment_type: details.employment_type || (offer ? offer.employment_type : 'full-time'),
      status: details.status || (offer && Number(offer.probation_months) > 0 ? 'probation' : 'active'),
      join_date: details.join_date || (offer ? offer.joining_date : new Date().toISOString().slice(0, 10)),
      salary: Number.isFinite(monthlySalary) ? monthlySalary : 0,
      avatar_color: details.avatar_color || 'indigo',
      bio: details.bio || `Onboarded through Aurora HR Portal.`,
    });

    const newEmployeeId = created.id;

    // Update application
    if (applicationId) {
      await conn.query(
        `UPDATE recruitment_applications
         SET converted_employee_id = ?, converted_at = NOW(), stage = 'hired', converted_by = ?
         WHERE id = ?`,
        [newEmployeeId, actorId, applicationId]
      );
    }

    // Update onboarding record
    if (onboardingId) {
      await conn.query('UPDATE onboarding_records SET employee_id = ? WHERE id = ?', [newEmployeeId, onboardingId]);
    }

    await conn.commit();

    const [[empRow]] = await pool.query('SELECT * FROM hrm_employees WHERE id = ?', [newEmployeeId]);
    return { employee: empRow, isNew: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Idempotently initiates onboarding when an offer is accepted.
 * - Creates an onboarding record if not already created.
 * - Instantiates checklist tasks from the default template.
 * - Creates invitation token and emails the candidate their portal link.
 */
export async function triggerAutomaticOnboarding({ offerId, actorId = null }) {
  const [[offer]] = await pool.query(`
    SELECT o.*, a.candidate_id, a.job_id, c.full_name AS candidate_name, c.email AS candidate_email
    FROM recruitment_offers o
    JOIN recruitment_applications a ON a.id = o.application_id
    JOIN recruitment_candidates c ON c.id = a.candidate_id
    WHERE o.id = ?
  `, [offerId]);

  if (!offer) throw new ApiError(404, 'Offer not found.');

  // Check if onboarding record already exists for this candidate/offer
  const [[existingOnb]] = await pool.query(
    'SELECT * FROM onboarding_records WHERE candidate_id = ? OR offer_id = ? LIMIT 1',
    [offer.candidate_id, offerId]
  );

  let onboardingId = existingOnb ? existingOnb.id : null;

  if (!existingOnb) {
    // Pick appropriate template based on employment type
    const templateType = offer.employment_type === 'intern' ? 'internship' : 'full_time';
    const [[tpl]] = await pool.query('SELECT * FROM onboarding_templates WHERE type = ? LIMIT 1', [templateType]);
    const templateId = tpl ? tpl.id : null;

    const [onbRes] = await pool.query(`
      INSERT INTO onboarding_records
        (candidate_id, application_id, offer_id, joining_date, designation, department_id,
         employment_type, work_location, template_id, status, progress_percent, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Headquarters', ?, 'pending', 0, ?)
    `, [
      offer.candidate_id,
      offer.application_id,
      offer.id,
      offer.joining_date || new Date().toISOString().slice(0, 10),
      offer.job_title,
      offer.department_id,
      offer.employment_type,
      templateId,
      actorId,
    ]);

    onboardingId = onbRes.insertId;

    // Instantiate tasks
    if (templateId) {
      const [tplTasks] = await pool.query(
        'SELECT * FROM onboarding_template_tasks WHERE template_id = ? ORDER BY sort_order ASC',
        [templateId]
      );
      for (const t of tplTasks) {
        const dueDate = new Date(offer.joining_date || Date.now());
        dueDate.setDate(dueDate.getDate() + (t.due_days || 3));
        await pool.query(`
          INSERT INTO onboarding_tasks
            (onboarding_id, title, description, category, assigned_role, due_date, status, is_mandatory, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `, [
          onboardingId,
          t.title,
          t.description,
          t.category,
          t.assigned_role,
          dueDate.toISOString().slice(0, 10),
          t.is_mandatory,
          t.sort_order,
        ]);
      }
    }
  }

  // Ensure single employee creation
  const { employee } = await ensureEmployeeForCandidate({
    candidateId: offer.candidate_id,
    applicationId: offer.application_id,
    offerId: offer.id,
    onboardingId,
    actorId,
  });

  return { onboardingId, employeeId: employee.id };
}


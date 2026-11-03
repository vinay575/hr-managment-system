import pool from './db.js';
import { PHASE3_SCHEMA } from './phase3-schema.js';

async function migrate() {
  console.log('--- Aurora HR: Migrating Phase 3 Schema ---');
  for (const statement of PHASE3_SCHEMA) {
    try {
      await pool.query(statement);
      const match = statement.match(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/i);
      if (match) {
        console.log(`✓ Table ensured: ${match[1]}`);
      }
    } catch (err) {
      console.error('Error running SQL statement:', err.message);
      throw err;
    }
  }

  // Seed default onboarding templates if none exist
  const [[tplCount]] = await pool.query('SELECT COUNT(*) AS count FROM onboarding_templates');
  if (tplCount.count === 0) {
    console.log('Seeding default onboarding templates & checklist tasks...');
    const templates = [
      {
        name: 'Full-Time Employee Onboarding',
        type: 'full_time',
        description: 'Standard onboarding checklist for regular full-time hires.',
        tasks: [
          { title: 'Personal Details Verification', category: 'PERSONAL INFORMATION', due_days: 2, is_mandatory: 1 },
          { title: 'Contact & Current Address', category: 'PERSONAL INFORMATION', due_days: 2, is_mandatory: 1 },
          { title: 'Emergency Contact Information', category: 'PERSONAL INFORMATION', due_days: 2, is_mandatory: 1 },
          { title: 'Government Identity Proof (Aadhaar/Passport)', category: 'DOCUMENT VERIFICATION', due_days: 3, is_mandatory: 1 },
          { title: 'PAN Card Submission', category: 'DOCUMENT VERIFICATION', due_days: 3, is_mandatory: 1 },
          { title: 'Educational Degree & Transcripts', category: 'DOCUMENT VERIFICATION', due_days: 3, is_mandatory: 1 },
          { title: 'Previous Employment Relieving / Payslips', category: 'DOCUMENT VERIFICATION', due_days: 4, is_mandatory: 0 },
          { title: 'Bank Account Details & Cancelled Cheque', category: 'DOCUMENT VERIFICATION', due_days: 3, is_mandatory: 1 },
          { title: 'Passport Size Photograph', category: 'DOCUMENT VERIFICATION', due_days: 2, is_mandatory: 1 },
          { title: 'Signed Offer Letter Acknowledgement', category: 'EMPLOYMENT FORMALITIES', due_days: 1, is_mandatory: 1 },
          { title: 'Employment Agreement', category: 'EMPLOYMENT FORMALITIES', due_days: 2, is_mandatory: 1 },
          { title: 'Company Policy Acknowledgement', category: 'EMPLOYMENT FORMALITIES', due_days: 3, is_mandatory: 1 },
          { title: 'Code of Conduct Acceptance', category: 'EMPLOYMENT FORMALITIES', due_days: 3, is_mandatory: 1 },
        ]
      },
      {
        name: 'Internship Onboarding',
        type: 'internship',
        description: 'Streamlined onboarding checklist for interns.',
        tasks: [
          { title: 'Personal Details & College Info', category: 'PERSONAL INFORMATION', due_days: 2, is_mandatory: 1 },
          { title: 'Emergency Contact Details', category: 'PERSONAL INFORMATION', due_days: 2, is_mandatory: 1 },
          { title: 'College ID & Government ID Proof', category: 'DOCUMENT VERIFICATION', due_days: 2, is_mandatory: 1 },
          { title: 'Bank Account & Stipend Details', category: 'DOCUMENT VERIFICATION', due_days: 2, is_mandatory: 1 },
          { title: 'Internship Agreement', category: 'EMPLOYMENT FORMALITIES', due_days: 1, is_mandatory: 1 },
          { title: 'Code of Conduct Acceptance', category: 'EMPLOYMENT FORMALITIES', due_days: 2, is_mandatory: 1 },
        ]
      },
      {
        name: 'Contractor Onboarding',
        type: 'contract',
        description: 'Vendor & contractor compliance checklist.',
        tasks: [
          { title: 'Contractor Identity & Tax Details', category: 'PERSONAL INFORMATION', due_days: 2, is_mandatory: 1 },
          { title: 'Contract Agreement & NDA', category: 'EMPLOYMENT FORMALITIES', due_days: 1, is_mandatory: 1 },
          { title: 'Invoicing & Bank Details', category: 'DOCUMENT VERIFICATION', due_days: 2, is_mandatory: 1 },
        ]
      },
      {
        name: 'Fresher Onboarding',
        type: 'fresher',
        description: 'New graduate onboarding including degree validation.',
        tasks: [
          { title: 'Personal Information', category: 'PERSONAL INFORMATION', due_days: 2, is_mandatory: 1 },
          { title: 'College Degree / Provisional Certificate', category: 'DOCUMENT VERIFICATION', due_days: 3, is_mandatory: 1 },
          { title: 'Identity & Address Proof', category: 'DOCUMENT VERIFICATION', due_days: 2, is_mandatory: 1 },
          { title: 'Bank Account Details', category: 'DOCUMENT VERIFICATION', due_days: 2, is_mandatory: 1 },
          { title: 'Employment Agreement', category: 'EMPLOYMENT FORMALITIES', due_days: 2, is_mandatory: 1 },
          { title: 'Code of Conduct & Company Policy', category: 'EMPLOYMENT FORMALITIES', due_days: 2, is_mandatory: 1 },
        ]
      }
    ];

    for (const tpl of templates) {
      const [res] = await pool.query(
        'INSERT INTO onboarding_templates (name, type, description) VALUES (?,?,?)',
        [tpl.name, tpl.type, tpl.description]
      );
      let order = 1;
      for (const t of tpl.tasks) {
        await pool.query(
          `INSERT INTO onboarding_template_tasks
            (template_id, title, category, assigned_role, due_days, is_mandatory, sort_order)
           VALUES (?,?,?, 'employee', ?,?,?)`,
          [res.insertId, t.title, t.category, t.due_days, t.is_mandatory, order++]
        );
      }
    }
    console.log('✓ Seeded default onboarding templates & tasks');
  }

  // Ensure default offer letter template
  const [[offerTplCount]] = await pool.query('SELECT COUNT(*) AS count FROM offer_letter_templates');
  if (offerTplCount.count === 0) {
    await pool.query(
      `INSERT INTO offer_letter_templates (name, template_type, subject, body, terms, is_default)
       VALUES (?,?,?,?,?, 1)`,
      [
        'Standard Employment Offer Letter',
        'full-time',
        'Offer of Employment - Aurora Labs',
        'We are pleased to extend an offer of employment to you for the position of {{job_title}} at Aurora Labs. We were very impressed by your background, experience, and energy.',
        '1. This offer is contingent upon satisfactory completion of background verification.\n2. You will be on probation for {{probation_months}} months from joining date.\n3. Notice period during probation is 15 days, and 30 days post-confirmation.'
      ]
    );
    console.log('✓ Seeded default offer letter template');
  }

  console.log('--- Phase 3 Migration Complete ---');
  process.exit(0);
}

migrate().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});


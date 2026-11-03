/**
 * Phase 3 Database Schema:
 * - Offer letter templates & offer records
 * - Onboarding templates, onboarding template tasks, onboarding records, tasks & documents
 * - Employee education & bank details
 * - Employee resignations & notice period records
 * - Employee exit documents
 */

export const PHASE3_TABLES = [
  'employee_exit_documents',
  'notice_period_records',
  'employee_resignations',
  'onboarding_documents',
  'onboarding_tasks',
  'onboarding_template_tasks',
  'onboarding_templates',
  'onboarding_records',
  'employee_education',
  'employee_bank_details',
  'offer_records',
  'offer_letter_templates',
  'candidate_portal_tokens',
];

export const PHASE3_SCHEMA = [
  // 1. Offer letter templates
  `CREATE TABLE IF NOT EXISTS offer_letter_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    template_type ENUM('full-time','part-time','contract','intern') NOT NULL DEFAULT 'full-time',
    subject VARCHAR(200) NOT NULL DEFAULT 'Offer of Employment - Aurora Labs',
    body TEXT NOT NULL,
    terms TEXT NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_olt_type (template_type),
    CONSTRAINT fk_olt_user FOREIGN KEY (created_by) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  // 2. Offer records (tracking email delivery, history, generated PDF references)
  `CREATE TABLE IF NOT EXISTS offer_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    offer_id INT NOT NULL,
    recipient_email VARCHAR(150) NOT NULL,
    recipient_name VARCHAR(150) NOT NULL,
    email_subject VARCHAR(255) NOT NULL,
    delivery_status ENUM('queued','sent','failed') NOT NULL DEFAULT 'sent',
    delivery_message VARCHAR(500) NULL,
    pdf_filename VARCHAR(255) NULL,
    sent_by INT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ofr_offer (offer_id),
    CONSTRAINT fk_ofr_offer FOREIGN KEY (offer_id) REFERENCES recruitment_offers(id) ON DELETE CASCADE,
    CONSTRAINT fk_ofr_user FOREIGN KEY (sent_by) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  // 3. Onboarding templates
  `CREATE TABLE IF NOT EXISTS onboarding_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    type ENUM('internship','full_time','contract','fresher') NOT NULL DEFAULT 'full_time',
    description TEXT NULL,
    department_id INT NULL,
    designation VARCHAR(150) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ont_type (type),
    CONSTRAINT fk_ont_dept FOREIGN KEY (department_id) REFERENCES hrm_departments(id) ON DELETE SET NULL,
    CONSTRAINT fk_ont_user FOREIGN KEY (created_by) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  // 4. Onboarding template tasks
  `CREATE TABLE IF NOT EXISTS onboarding_template_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    category ENUM('PERSONAL INFORMATION','DOCUMENT VERIFICATION','EMPLOYMENT FORMALITIES') NOT NULL DEFAULT 'PERSONAL INFORMATION',
    assigned_role VARCHAR(50) NOT NULL DEFAULT 'employee',
    due_days INT NOT NULL DEFAULT 3,
    is_mandatory TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ott_template (template_id),
    CONSTRAINT fk_ott_template FOREIGN KEY (template_id) REFERENCES onboarding_templates(id) ON DELETE CASCADE
  )`,

  // 5. Onboarding records
  `CREATE TABLE IF NOT EXISTS onboarding_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NULL,
    candidate_id INT NULL,
    application_id INT NULL,
    offer_id INT NULL,
    template_id INT NULL,
    joining_date DATE NOT NULL,
    designation VARCHAR(150) NOT NULL,
    department_id INT NULL,
    reporting_manager_id INT NULL,
    employment_type ENUM('full-time','part-time','contract','intern') NOT NULL DEFAULT 'full-time',
    work_location VARCHAR(150) NOT NULL DEFAULT 'Headquarters',
    assigned_hr_id INT NULL,
    status ENUM('pending','in_progress','submitted','under_review','completed','rejected') NOT NULL DEFAULT 'pending',
    progress_percent INT NOT NULL DEFAULT 0,
    portal_access_token VARCHAR(100) NULL,
    notes TEXT NULL,
    completed_at DATETIME NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_onb_candidate (candidate_id),
    UNIQUE KEY uniq_onb_employee (employee_id),
    INDEX idx_onb_status (status),
    CONSTRAINT fk_onb_emp FOREIGN KEY (employee_id) REFERENCES hrm_employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_onb_cand FOREIGN KEY (candidate_id) REFERENCES recruitment_candidates(id) ON DELETE SET NULL,
    CONSTRAINT fk_onb_app FOREIGN KEY (application_id) REFERENCES recruitment_applications(id) ON DELETE SET NULL,
    CONSTRAINT fk_onb_off FOREIGN KEY (offer_id) REFERENCES recruitment_offers(id) ON DELETE SET NULL,
    CONSTRAINT fk_onb_tpl FOREIGN KEY (template_id) REFERENCES onboarding_templates(id) ON DELETE SET NULL,
    CONSTRAINT fk_onb_dept FOREIGN KEY (department_id) REFERENCES hrm_departments(id) ON DELETE SET NULL,
    CONSTRAINT fk_onb_mgr FOREIGN KEY (reporting_manager_id) REFERENCES hrm_employees(id) ON DELETE SET NULL,
    CONSTRAINT fk_onb_hr FOREIGN KEY (assigned_hr_id) REFERENCES hrm_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_onb_user FOREIGN KEY (created_by) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  // 6. Onboarding tasks (instances assigned to an onboarding record)
  `CREATE TABLE IF NOT EXISTS onboarding_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    onboarding_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    category ENUM('PERSONAL INFORMATION','DOCUMENT VERIFICATION','EMPLOYMENT FORMALITIES') NOT NULL DEFAULT 'PERSONAL INFORMATION',
    assigned_role VARCHAR(50) NOT NULL DEFAULT 'employee',
    due_date DATE NULL,
    status ENUM('pending','in_progress','submitted','under_review','completed','rejected','overdue') NOT NULL DEFAULT 'pending',
    is_mandatory TINYINT(1) NOT NULL DEFAULT 1,
    rejection_reason TEXT NULL,
    completed_at DATETIME NULL,
    completed_by INT NULL,
    verified_by INT NULL,
    verified_at DATETIME NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ot_onboarding (onboarding_id),
    INDEX idx_ot_status (status),
    CONSTRAINT fk_ot_onb FOREIGN KEY (onboarding_id) REFERENCES onboarding_records(id) ON DELETE CASCADE,
    CONSTRAINT fk_ot_completed FOREIGN KEY (completed_by) REFERENCES hrm_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_ot_verified FOREIGN KEY (verified_by) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  // 7. Onboarding documents
  `CREATE TABLE IF NOT EXISTS onboarding_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    onboarding_id INT NOT NULL,
    task_id INT NULL,
    doc_type ENUM(
      'identity_proof',
      'pan_card',
      'address_proof',
      'photograph',
      'educational_certificate',
      'previous_employment',
      'bank_proof',
      'signed_offer_letter',
      'employment_agreement',
      'other'
    ) NOT NULL,
    title VARCHAR(200) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_size INT NOT NULL DEFAULT 0,
    mime_type VARCHAR(120) NOT NULL,
    status ENUM('pending','submitted','verified','rejected') NOT NULL DEFAULT 'submitted',
    rejection_reason TEXT NULL,
    verified_by INT NULL,
    verified_at DATETIME NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ond_onb (onboarding_id),
    INDEX idx_ond_status (status),
    CONSTRAINT fk_ond_onb FOREIGN KEY (onboarding_id) REFERENCES onboarding_records(id) ON DELETE CASCADE,
    CONSTRAINT fk_ond_task FOREIGN KEY (task_id) REFERENCES onboarding_tasks(id) ON DELETE SET NULL,
    CONSTRAINT fk_ond_verified FOREIGN KEY (verified_by) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  // 8. Employee education
  `CREATE TABLE IF NOT EXISTS employee_education (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    highest_qualification VARCHAR(150) NOT NULL,
    institution VARCHAR(200) NOT NULL,
    course_specialization VARCHAR(200) NOT NULL,
    graduation_year INT NOT NULL,
    score_percentage_cgpa VARCHAR(50) NOT NULL,
    certificate_file VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ee_emp (employee_id),
    CONSTRAINT fk_ee_emp FOREIGN KEY (employee_id) REFERENCES hrm_employees(id) ON DELETE CASCADE
  )`,

  // 9. Employee bank details (secure)
  `CREATE TABLE IF NOT EXISTS employee_bank_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL UNIQUE,
    account_holder_name VARCHAR(150) NOT NULL,
    bank_name VARCHAR(150) NOT NULL,
    account_number VARCHAR(100) NOT NULL,
    ifsc_code VARCHAR(50) NOT NULL,
    branch_name VARCHAR(150) NOT NULL,
    is_verified TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ebd_emp FOREIGN KEY (employee_id) REFERENCES hrm_employees(id) ON DELETE CASCADE
  )`,

  // 10. Employee resignations
  `CREATE TABLE IF NOT EXISTS employee_resignations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    resignation_date DATE NOT NULL,
    proposed_last_working_day DATE NOT NULL,
    approved_last_working_day DATE NULL,
    reason VARCHAR(255) NOT NULL,
    comments TEXT NULL,
    supporting_doc VARCHAR(255) NULL,
    status ENUM('pending','under_review','clarification_requested','approved','rejected','withdrawn') NOT NULL DEFAULT 'pending',
    clarification_notes TEXT NULL,
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_er_emp (employee_id),
    INDEX idx_er_status (status),
    CONSTRAINT fk_er_emp FOREIGN KEY (employee_id) REFERENCES hrm_employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_er_user FOREIGN KEY (reviewed_by) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  // 11. Notice period records
  `CREATE TABLE IF NOT EXISTS notice_period_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    resignation_id INT NOT NULL UNIQUE,
    employee_id INT NOT NULL,
    notice_duration_days INT NOT NULL DEFAULT 30,
    submission_date DATE NOT NULL,
    expected_lwd DATE NOT NULL,
    approved_lwd DATE NULL,
    status ENUM('serving','shortened','waived','completed') NOT NULL DEFAULT 'serving',
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_npr_emp (employee_id),
    CONSTRAINT fk_npr_resig FOREIGN KEY (resignation_id) REFERENCES employee_resignations(id) ON DELETE CASCADE,
    CONSTRAINT fk_npr_emp FOREIGN KEY (employee_id) REFERENCES hrm_employees(id) ON DELETE CASCADE
  )`,

  // 12. Employee exit documents
  `CREATE TABLE IF NOT EXISTS employee_exit_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    resignation_id INT NULL,
    doc_type ENUM('experience_letter','relieving_letter','exit_confirmation','final_settlement') NOT NULL,
    document_number VARCHAR(60) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    content_html TEXT NULL,
    pdf_filename VARCHAR(255) NULL,
    generated_by INT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_eed_emp (employee_id),
    INDEX idx_eed_type (doc_type),
    CONSTRAINT fk_eed_emp FOREIGN KEY (employee_id) REFERENCES hrm_employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_eed_resig FOREIGN KEY (resignation_id) REFERENCES employee_resignations(id) ON DELETE SET NULL,
    CONSTRAINT fk_eed_user FOREIGN KEY (generated_by) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  // 13. Secure, time-limited candidate portal invitations
  `CREATE TABLE IF NOT EXISTS candidate_portal_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    candidate_id INT NOT NULL,
    offer_id INT NULL,
    application_id INT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    email VARCHAR(150) NOT NULL,
    scope ENUM('offer','onboarding','all') NOT NULL DEFAULT 'all',
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    used_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cpt_hash (token_hash),
    INDEX idx_cpt_candidate (candidate_id)
  )`
];

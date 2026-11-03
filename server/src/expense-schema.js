/**
 * Phase 4 — Expense Management schema.
 * Safe, additive DDL only. Existing tables are never altered or dropped.
 */

export const EXPENSE_TABLES = [
  'expense_settings',
  'expense_activity_logs',
  'expense_reimbursements',
  'expense_approvals',
  'expense_attachments',
  'expense_claims',
  'expense_categories',
];

export const EXPENSE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS expense_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(400) NULL,
    receipt_required TINYINT(1) NOT NULL DEFAULT 1,
    requires_approval TINYINT(1) NOT NULL DEFAULT 1,
    max_claim_amount DECIMAL(12,2) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_expense_category_name (name),
    CONSTRAINT fk_expcat_user FOREIGN KEY (created_by) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS expense_claims (
    id INT AUTO_INCREMENT PRIMARY KEY,
    expense_code VARCHAR(32) NOT NULL,
    employee_id INT NOT NULL,
    department_id INT NULL,
    category_id INT NOT NULL,
    title VARCHAR(180) NOT NULL,
    expense_date DATE NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    approved_amount DECIMAL(12,2) NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    purpose TEXT NOT NULL,
    project_name VARCHAR(150) NULL,
    client_name VARCHAR(150) NULL,
    vendor_name VARCHAR(150) NULL,
    merchant_name VARCHAR(150) NULL,
    additional_notes TEXT NULL,
    approval_status ENUM('draft','submitted','under_review','clarification_required','approved','rejected','reimbursement_pending','partially_reimbursed','reimbursed','cancelled') NOT NULL DEFAULT 'draft',
    reimbursement_status ENUM('pending','processing','partially_paid','paid','failed','on_hold') NOT NULL DEFAULT 'pending',
    submitted_at DATETIME NULL,
    approved_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_expense_code (expense_code),
    INDEX idx_exp_employee (employee_id),
    INDEX idx_exp_department (department_id),
    INDEX idx_exp_category (category_id),
    INDEX idx_exp_status (approval_status),
    INDEX idx_exp_reimb_status (reimbursement_status),
    INDEX idx_exp_date (expense_date),
    INDEX idx_exp_created (created_at),
    CONSTRAINT fk_exp_employee FOREIGN KEY (employee_id) REFERENCES hrm_employees(id) ON DELETE RESTRICT,
    CONSTRAINT fk_exp_department FOREIGN KEY (department_id) REFERENCES hrm_departments(id) ON DELETE SET NULL,
    CONSTRAINT fk_exp_category FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE RESTRICT
  )`,

  `CREATE TABLE IF NOT EXISTS expense_attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    expense_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(120) NULL,
    file_size INT NOT NULL DEFAULT 0,
    file_hash CHAR(64) NULL,
    uploaded_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_expatt_expense (expense_id),
    INDEX idx_expatt_hash (file_hash),
    CONSTRAINT fk_expatt_expense FOREIGN KEY (expense_id) REFERENCES expense_claims(id) ON DELETE CASCADE,
    CONSTRAINT fk_expatt_user FOREIGN KEY (uploaded_by) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS expense_approvals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    expense_id INT NOT NULL,
    approver_id INT NULL,
    action VARCHAR(40) NOT NULL,
    comments TEXT NULL,
    rejection_reason TEXT NULL,
    action_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_expapp_expense (expense_id),
    INDEX idx_expapp_approver (approver_id),
    CONSTRAINT fk_expapp_expense FOREIGN KEY (expense_id) REFERENCES expense_claims(id) ON DELETE CASCADE,
    CONSTRAINT fk_expapp_user FOREIGN KEY (approver_id) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS expense_reimbursements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    expense_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method ENUM('bank_transfer','upi','cash','other') NOT NULL DEFAULT 'bank_transfer',
    transaction_reference VARCHAR(120) NULL,
    payment_date DATE NULL,
    payment_status ENUM('pending','processing','partially_paid','paid','failed','on_hold') NOT NULL DEFAULT 'pending',
    payment_notes TEXT NULL,
    processed_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_expreim_expense (expense_id),
    INDEX idx_expreim_status (payment_status),
    INDEX idx_expreim_ref (transaction_reference),
    CONSTRAINT fk_expreim_expense FOREIGN KEY (expense_id) REFERENCES expense_claims(id) ON DELETE CASCADE,
    CONSTRAINT fk_expreim_user FOREIGN KEY (processed_by) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS expense_activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    expense_id INT NOT NULL,
    user_id INT NULL,
    action VARCHAR(60) NOT NULL,
    description VARCHAR(500) NULL,
    old_status VARCHAR(40) NULL,
    new_status VARCHAR(40) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_expact_expense (expense_id),
    INDEX idx_expact_created (created_at),
    CONSTRAINT fk_expact_expense FOREIGN KEY (expense_id) REFERENCES expense_claims(id) ON DELETE CASCADE,
    CONSTRAINT fk_expact_user FOREIGN KEY (user_id) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS expense_settings (
    setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
    setting_value TEXT NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
];

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Travel', description: 'Flights, trains, taxis and travel bookings.', receipt_required: 1, max_claim_amount: null },
  { name: 'Food & Refreshments', description: 'Meals and refreshments during business activity.', receipt_required: 1, max_claim_amount: null },
  { name: 'Accommodation', description: 'Hotel stays and lodging for business travel.', receipt_required: 1, max_claim_amount: null },
  { name: 'Fuel & Transportation', description: 'Fuel, mileage and local transportation.', receipt_required: 1, max_claim_amount: null },
  { name: 'Internet & Mobile', description: 'Business internet and mobile phone charges.', receipt_required: 1, max_claim_amount: null },
  { name: 'Office Supplies', description: 'Stationery, equipment and office consumables.', receipt_required: 1, max_claim_amount: null },
  { name: 'Medical', description: 'Medical consultations, medicine and health expenses.', receipt_required: 1, max_claim_amount: null },
  { name: 'Client Meetings', description: 'Client hospitality and meeting expenses.', receipt_required: 1, max_claim_amount: null },
  { name: 'Training & Development', description: 'Courses, certifications and professional development.', receipt_required: 1, max_claim_amount: null },
  { name: 'Other', description: 'Other approved business expenses.', receipt_required: 0, max_claim_amount: null },
];

export const DEFAULT_EXPENSE_SETTINGS = {
  default_currency: 'USD',
  receipt_threshold_amount: '0',
  max_attachment_mb: '10',
  max_attachments_per_expense: '5',
  reimbursement_reminder_days: '7',
  allow_draft_claims: '1',
  require_manager_approval: '1',
  statement_footer: 'Aurora Labs · People, beautifully managed',
};

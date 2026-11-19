/**
 * Phase 6 — Employee Document Management schema.
 * Additive, idempotent DDL only. Existing tables are never altered or dropped.
 *
 * Existing document sources (onboarding_documents, employee_exit_documents)
 * are intentionally NOT duplicated here. The API presents them alongside
 * employee_documents as one central document history.
 *
 * NOTE: The managed TiDB account used by this deployment does not hold the
 * REFERENCES privilege, so referential integrity is enforced by the API and
 * indexed foreign-key columns instead of database constraints. This mirrors
 * the least-privilege account used by the running application and keeps the
 * migration safe to run against the existing production database.
 */

export const DOCUMENT_TABLES = [
  'document_reminder_history',
  'document_activity_history',
  'document_verification_history',
  'employee_documents',
  'document_categories',
  'document_settings',
];

export const DOCUMENT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS document_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(120) NOT NULL,
    group_name VARCHAR(60) NOT NULL DEFAULT 'Other Documents',
    description VARCHAR(400) NULL,
    is_required TINYINT(1) NOT NULL DEFAULT 0,
    requires_expiry TINYINT(1) NOT NULL DEFAULT 0,
    employee_uploads TINYINT(1) NOT NULL DEFAULT 1,
    requires_verification TINYINT(1) NOT NULL DEFAULT 1,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_document_category_name (name),
    UNIQUE KEY uq_document_category_slug (slug),
    INDEX idx_doccat_active (is_active, sort_order),
    INDEX idx_doccat_user (created_by)
  )`,

  `CREATE TABLE IF NOT EXISTS employee_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_number VARCHAR(32) NULL,
    employee_id INT NOT NULL,
    department_id INT NULL,
    category_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    document_number_value VARCHAR(120) NULL,
    issue_date DATE NULL,
    expiry_date DATE NULL,
    description TEXT NULL,
    status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
    verification_notes TEXT NULL,
    rejection_reason TEXT NULL,
    storage_provider VARCHAR(24) NOT NULL DEFAULT 'local',
    storage_key VARCHAR(255) NOT NULL,
    storage_file_id VARCHAR(255) NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INT NOT NULL DEFAULT 0,
    mime_type VARCHAR(120) NOT NULL,
    file_hash CHAR(64) NULL,
    uploaded_by INT NULL,
    verified_by INT NULL,
    verified_at DATETIME NULL,
    source VARCHAR(24) NOT NULL DEFAULT 'upload',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_document_number (document_number),
    INDEX idx_doc_employee (employee_id),
    INDEX idx_doc_department (department_id),
    INDEX idx_doc_category (category_id),
    INDEX idx_doc_status (status),
    INDEX idx_doc_expiry (expiry_date),
    INDEX idx_doc_created (created_at),
    INDEX idx_doc_uploader (uploaded_by),
    INDEX idx_doc_verifier (verified_by)
  )`,

  `CREATE TABLE IF NOT EXISTS document_verification_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id INT NOT NULL,
    action VARCHAR(40) NOT NULL,
    status VARCHAR(24) NULL,
    notes TEXT NULL,
    rejection_reason TEXT NULL,
    performed_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_docver_doc (document_id, created_at),
    INDEX idx_docver_user (performed_by)
  )`,

  `CREATE TABLE IF NOT EXISTS document_activity_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id INT NULL,
    employee_id INT NULL,
    action VARCHAR(60) NOT NULL,
    details TEXT NULL,
    performed_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_docact_doc (document_id, created_at),
    INDEX idx_docact_employee (employee_id, created_at),
    INDEX idx_docact_user (performed_by)
  )`,

  `CREATE TABLE IF NOT EXISTS document_reminder_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id INT NULL,
    employee_id INT NOT NULL,
    category_id INT NULL,
    reminder_type VARCHAR(32) NOT NULL,
    days_before INT NULL,
    recipient_user_id INT NULL,
    dedupe_key VARCHAR(191) NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_docrem_dedupe (dedupe_key),
    INDEX idx_docrem_employee (employee_id, sent_at),
    INDEX idx_docrem_category (category_id),
    INDEX idx_docrem_document (document_id)
  )`,

  `CREATE TABLE IF NOT EXISTS document_settings (
    setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
    setting_value TEXT NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
];

/** Required document catalogue. Existing rows are never overwritten. */
export const DEFAULT_DOCUMENT_CATEGORIES = [
  { name: 'Aadhaar Card / National ID', slug: 'national-id', group: 'Identity Documents', required: 1, expiry: 0, uploads: 1, verification: 1 },
  { name: 'PAN Card', slug: 'pan-card', group: 'Identity Documents', required: 1, expiry: 0, uploads: 1, verification: 1 },
  { name: 'Passport', slug: 'passport', group: 'Identity Documents', required: 0, expiry: 1, uploads: 1, verification: 1 },
  { name: 'Driving License', slug: 'driving-license', group: 'Identity Documents', required: 0, expiry: 1, uploads: 1, verification: 1 },
  { name: 'Voter ID', slug: 'voter-id', group: 'Identity Documents', required: 0, expiry: 0, uploads: 1, verification: 1 },
  { name: 'Photograph', slug: 'photograph', group: 'Identity Documents', required: 1, expiry: 0, uploads: 1, verification: 1 },

  { name: 'Offer Letter', slug: 'offer-letter', group: 'Employment Documents', required: 0, expiry: 0, uploads: 0, verification: 1 },
  { name: 'Employment Agreement', slug: 'employment-agreement', group: 'Employment Documents', required: 1, expiry: 0, uploads: 0, verification: 1 },
  { name: 'Appointment Letter', slug: 'appointment-letter', group: 'Employment Documents', required: 0, expiry: 0, uploads: 0, verification: 1 },
  { name: 'Employee Contract', slug: 'employee-contract', group: 'Employment Documents', required: 0, expiry: 1, uploads: 0, verification: 1 },
  { name: 'Relieving Letter', slug: 'relieving-letter', group: 'Employment Documents', required: 0, expiry: 0, uploads: 0, verification: 1 },
  { name: 'Experience Letter', slug: 'experience-letter', group: 'Employment Documents', required: 0, expiry: 0, uploads: 0, verification: 1 },

  { name: '10th Certificate', slug: 'class-10-certificate', group: 'Education Documents', required: 0, expiry: 0, uploads: 1, verification: 1 },
  { name: '12th Certificate', slug: 'class-12-certificate', group: 'Education Documents', required: 0, expiry: 0, uploads: 1, verification: 1 },
  { name: 'Graduation Certificate', slug: 'graduation-certificate', group: 'Education Documents', required: 1, expiry: 0, uploads: 1, verification: 1 },
  { name: 'Post-Graduation Certificate', slug: 'post-graduation-certificate', group: 'Education Documents', required: 0, expiry: 0, uploads: 1, verification: 1 },
  { name: 'Other Educational Certificate', slug: 'other-education-certificate', group: 'Education Documents', required: 0, expiry: 0, uploads: 1, verification: 1 },

  { name: 'Address Proof', slug: 'address-proof', group: 'Address Documents', required: 0, expiry: 0, uploads: 1, verification: 1 },
  { name: 'Utility Bill', slug: 'utility-bill', group: 'Address Documents', required: 0, expiry: 1, uploads: 1, verification: 1 },
  { name: 'Rental Agreement', slug: 'rental-agreement', group: 'Address Documents', required: 0, expiry: 1, uploads: 1, verification: 1 },

  { name: 'Bank Account Proof', slug: 'bank-proof', group: 'Financial Documents', required: 1, expiry: 0, uploads: 1, verification: 1 },
  { name: 'Cancelled Cheque', slug: 'cancelled-cheque', group: 'Financial Documents', required: 0, expiry: 0, uploads: 1, verification: 1 },
  { name: 'Bank Statement', slug: 'bank-statement', group: 'Financial Documents', required: 0, expiry: 0, uploads: 1, verification: 1 },

  { name: 'Professional Certification', slug: 'professional-certification', group: 'Other Documents', required: 0, expiry: 1, uploads: 1, verification: 1 },
  { name: 'Training Certificate', slug: 'training-certificate', group: 'Other Documents', required: 0, expiry: 1, uploads: 1, verification: 1 },
  { name: 'Medical Certificate', slug: 'medical-certificate', group: 'Other Documents', required: 0, expiry: 1, uploads: 1, verification: 1 },
  { name: 'Other Document', slug: 'other', group: 'Other Documents', required: 0, expiry: 0, uploads: 1, verification: 1 },
];

export const DEFAULT_DOCUMENT_SETTINGS = {
  documents_enabled: '1',
  default_requires_verification: '1',
  max_upload_mb: '15',
  allowed_extensions: 'pdf,jpg,jpeg,png,doc,docx',
  expiry_warning_days: '30',
  expiry_reminder_days: '30,15,7,0',
  notify_employee: '1',
  notify_hr: '1',
  missing_document_reminders: '1',
  retention_years: '7',
};

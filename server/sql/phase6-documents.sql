-- Kodewar HRMS — Phase 6 Employee Document Management
-- Additive only. Safe to run more than once. Existing data is untouched.

CREATE TABLE IF NOT EXISTS document_categories (
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
  );

CREATE TABLE IF NOT EXISTS employee_documents (
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
  );

CREATE TABLE IF NOT EXISTS document_verification_history (
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
  );

CREATE TABLE IF NOT EXISTS document_activity_history (
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
  );

CREATE TABLE IF NOT EXISTS document_reminder_history (
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
  );

CREATE TABLE IF NOT EXISTS document_settings (
    setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
    setting_value TEXT NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );

-- Default document categories
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Aadhaar Card / National ID','national-id','Identity Documents',1,0,1,1,1,0);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('PAN Card','pan-card','Identity Documents',1,0,1,1,1,1);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Passport','passport','Identity Documents',0,1,1,1,1,2);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Driving License','driving-license','Identity Documents',0,1,1,1,1,3);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Voter ID','voter-id','Identity Documents',0,0,1,1,1,4);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Photograph','photograph','Identity Documents',1,0,1,1,1,5);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Offer Letter','offer-letter','Employment Documents',0,0,0,1,1,6);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Employment Agreement','employment-agreement','Employment Documents',1,0,0,1,1,7);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Appointment Letter','appointment-letter','Employment Documents',0,0,0,1,1,8);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Employee Contract','employee-contract','Employment Documents',0,1,0,1,1,9);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Relieving Letter','relieving-letter','Employment Documents',0,0,0,1,1,10);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Experience Letter','experience-letter','Employment Documents',0,0,0,1,1,11);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('10th Certificate','class-10-certificate','Education Documents',0,0,1,1,1,12);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('12th Certificate','class-12-certificate','Education Documents',0,0,1,1,1,13);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Graduation Certificate','graduation-certificate','Education Documents',1,0,1,1,1,14);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Post-Graduation Certificate','post-graduation-certificate','Education Documents',0,0,1,1,1,15);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Other Educational Certificate','other-education-certificate','Education Documents',0,0,1,1,1,16);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Address Proof','address-proof','Address Documents',0,0,1,1,1,17);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Utility Bill','utility-bill','Address Documents',0,1,1,1,1,18);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Rental Agreement','rental-agreement','Address Documents',0,1,1,1,1,19);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Bank Account Proof','bank-proof','Financial Documents',1,0,1,1,1,20);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Cancelled Cheque','cancelled-cheque','Financial Documents',0,0,1,1,1,21);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Bank Statement','bank-statement','Financial Documents',0,0,1,1,1,22);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Professional Certification','professional-certification','Other Documents',0,1,1,1,1,23);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Training Certificate','training-certificate','Other Documents',0,1,1,1,1,24);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Medical Certificate','medical-certificate','Other Documents',0,1,1,1,1,25);
INSERT IGNORE INTO document_categories (name, slug, group_name, is_required, requires_expiry, employee_uploads, requires_verification, is_active, sort_order) VALUES ('Other Document','other','Other Documents',0,0,1,1,1,26);

-- Default settings
INSERT IGNORE INTO document_settings (setting_key, setting_value) VALUES ('documents_enabled','1');
INSERT IGNORE INTO document_settings (setting_key, setting_value) VALUES ('default_requires_verification','1');
INSERT IGNORE INTO document_settings (setting_key, setting_value) VALUES ('max_upload_mb','15');
INSERT IGNORE INTO document_settings (setting_key, setting_value) VALUES ('allowed_extensions','pdf,jpg,jpeg,png,doc,docx');
INSERT IGNORE INTO document_settings (setting_key, setting_value) VALUES ('expiry_warning_days','30');
INSERT IGNORE INTO document_settings (setting_key, setting_value) VALUES ('expiry_reminder_days','30,15,7,0');
INSERT IGNORE INTO document_settings (setting_key, setting_value) VALUES ('notify_employee','1');
INSERT IGNORE INTO document_settings (setting_key, setting_value) VALUES ('notify_hr','1');
INSERT IGNORE INTO document_settings (setting_key, setting_value) VALUES ('missing_document_reminders','1');
INSERT IGNORE INTO document_settings (setting_key, setting_value) VALUES ('retention_years','7');

-- Document permissions for every role (super admin always full)
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('super_admin','documents.view');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('super_admin','documents.manage');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('super_admin','documents.verify');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('super_admin','documents.categories.manage');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('super_admin','documents.reports');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('super_admin','documents.settings');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('super_admin','documents.self');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('ceo','documents.view');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('ceo','documents.reports');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('ceo','documents.self');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('administration','documents.view');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('administration','documents.manage');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('administration','documents.verify');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('administration','documents.reports');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('administration','documents.self');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('hr','documents.view');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('hr','documents.manage');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('hr','documents.verify');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('hr','documents.categories.manage');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('hr','documents.reports');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('hr','documents.settings');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('hr','documents.self');
INSERT IGNORE INTO hrm_role_permissions (role, permission) VALUES ('employee','documents.self');

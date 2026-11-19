/**
 * Phase 7 — Announcements & Internal Communication schema.
 *
 * Additive, idempotent DDL only. Existing employees, departments, users,
 * notifications and all other HR data are never altered or dropped.
 *
 * As with Phases 4–6, the managed TiDB application account does not hold the
 * REFERENCES privilege. Referential integrity is therefore enforced by the API
 * and indexed relation columns instead of database foreign keys.
 */

export const ANNOUNCEMENT_TABLES = ['announcement_acknowledgments', 'announcements'];

export const ANNOUNCEMENT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS announcements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(24) NOT NULL DEFAULT 'general',
    audience VARCHAR(24) NOT NULL DEFAULT 'everyone',
    department_id INT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'draft',
    publish_at DATETIME NULL,
    published_at DATETIME NULL,
    archived_at DATETIME NULL,
    requires_acknowledgment TINYINT(1) NOT NULL DEFAULT 0,
    attachment_provider VARCHAR(24) NULL,
    attachment_key VARCHAR(255) NULL,
    attachment_file_id VARCHAR(255) NULL,
    attachment_name VARCHAR(255) NULL,
    attachment_size INT NULL,
    attachment_mime VARCHAR(120) NULL,
    created_by INT NULL,
    updated_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ann_status_publish (status, publish_at),
    INDEX idx_ann_audience_department (audience, department_id),
    INDEX idx_ann_published (published_at),
    INDEX idx_ann_created (created_at),
    INDEX idx_ann_author (created_by)
  )`,

  `CREATE TABLE IF NOT EXISTS announcement_acknowledgments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    announcement_id INT NOT NULL,
    employee_id INT NOT NULL,
    acknowledged_by INT NULL,
    acknowledged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_announcement_employee_ack (announcement_id, employee_id),
    INDEX idx_annack_announcement (announcement_id, acknowledged_at),
    INDEX idx_annack_employee (employee_id),
    INDEX idx_annack_user (acknowledged_by)
  )`,
];

export const DEFAULT_ANNOUNCEMENT_CATEGORIES = ['general', 'hr', 'holiday', 'policy', 'important'];

export const DEFAULT_ANNOUNCEMENT_STATUSES = ['draft', 'scheduled', 'published', 'archived'];

export const DEFAULT_ANNOUNCEMENT_AUDIENCES = ['everyone', 'department'];

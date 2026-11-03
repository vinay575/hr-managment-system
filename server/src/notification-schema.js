export const NOTIFICATION_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS hrm_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    recipient_user_id INT NOT NULL,
    category VARCHAR(32) NOT NULL,
    visibility_permission VARCHAR(64) NOT NULL,
    title VARCHAR(180) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    related_path VARCHAR(512) NULL,
    dedupe_key VARCHAR(191) NOT NULL,
    read_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_notification_recipient_dedupe (recipient_user_id, dedupe_key),
    INDEX idx_notification_recipient_visibility (recipient_user_id, visibility_permission, read_at, created_at),
    CONSTRAINT fk_notification_recipient FOREIGN KEY (recipient_user_id)
      REFERENCES hrm_users(id) ON DELETE CASCADE
  )`,
];

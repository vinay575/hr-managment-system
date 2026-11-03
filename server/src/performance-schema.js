/**
 * Phase 5 — Performance Management schema.
 * Safe, additive DDL only. Existing tables are never altered, dropped or reset.
 */

export const PERFORMANCE_TABLES = [
  'performance_activity_logs',
  'performance_goal_attachments',
  'performance_goal_updates',
  'performance_review_cycle_employees',
  'performance_review_cycles',
  'performance_goals',
];

export const PERFORMANCE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS performance_goals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    goal_code VARCHAR(32) NOT NULL,
    title VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    employee_id INT NOT NULL,
    department_id INT NULL,
    assigned_by INT NULL,
    start_date DATE NOT NULL,
    target_date DATE NOT NULL,
    priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
    status ENUM('not_started','in_progress','completed','on_hold','overdue','cancelled') NOT NULL DEFAULT 'not_started',
    progress_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
    instructions TEXT NULL,
    additional_notes TEXT NULL,
    completed_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_perf_goal_code (goal_code),
    INDEX idx_perf_goal_employee (employee_id),
    INDEX idx_perf_goal_department (department_id),
    INDEX idx_perf_goal_status (status),
    INDEX idx_perf_goal_priority (priority),
    INDEX idx_perf_goal_target (target_date),
    INDEX idx_perf_goal_created (created_at),
    CONSTRAINT fk_perf_goal_employee FOREIGN KEY (employee_id) REFERENCES hrm_employees(id) ON DELETE RESTRICT,
    CONSTRAINT fk_perf_goal_department FOREIGN KEY (department_id) REFERENCES hrm_departments(id) ON DELETE SET NULL,
    CONSTRAINT fk_perf_goal_assigned_by FOREIGN KEY (assigned_by) REFERENCES hrm_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_perf_goal_created_by FOREIGN KEY (created_by) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS performance_goal_updates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    goal_id INT NOT NULL,
    previous_status VARCHAR(40) NULL,
    new_status VARCHAR(40) NULL,
    previous_percentage DECIMAL(5,2) NULL,
    new_percentage DECIMAL(5,2) NULL,
    progress_notes TEXT NULL,
    updated_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_perf_update_goal (goal_id),
    INDEX idx_perf_update_created (created_at),
    CONSTRAINT fk_perf_update_goal FOREIGN KEY (goal_id) REFERENCES performance_goals(id) ON DELETE CASCADE,
    CONSTRAINT fk_perf_update_user FOREIGN KEY (updated_by) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS performance_goal_attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    goal_id INT NOT NULL,
    update_id INT NULL,
    file_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(120) NULL,
    file_size INT NOT NULL DEFAULT 0,
    file_hash CHAR(64) NULL,
    uploaded_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_perf_att_goal (goal_id),
    INDEX idx_perf_att_update (update_id),
    INDEX idx_perf_att_hash (file_hash),
    CONSTRAINT fk_perf_att_goal FOREIGN KEY (goal_id) REFERENCES performance_goals(id) ON DELETE CASCADE,
    CONSTRAINT fk_perf_att_update FOREIGN KEY (update_id) REFERENCES performance_goal_updates(id) ON DELETE SET NULL,
    CONSTRAINT fk_perf_att_user FOREIGN KEY (uploaded_by) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS performance_review_cycles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cycle_name VARCHAR(160) NOT NULL,
    description TEXT NULL,
    review_period ENUM('monthly','quarterly','half_yearly','annually','custom') NOT NULL DEFAULT 'quarterly',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    department_id INT NULL,
    status ENUM('draft','scheduled','active','completed','cancelled') NOT NULL DEFAULT 'draft',
    created_by INT NULL,
    activated_at DATETIME NULL,
    completed_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_perf_cycle_status (status),
    INDEX idx_perf_cycle_period (review_period),
    INDEX idx_perf_cycle_department (department_id),
    INDEX idx_perf_cycle_dates (start_date, end_date),
    CONSTRAINT fk_perf_cycle_department FOREIGN KEY (department_id) REFERENCES hrm_departments(id) ON DELETE SET NULL,
    CONSTRAINT fk_perf_cycle_user FOREIGN KEY (created_by) REFERENCES hrm_users(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS performance_review_cycle_employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cycle_id INT NOT NULL,
    employee_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_perf_cycle_employee (cycle_id, employee_id),
    INDEX idx_perf_cycle_emp (employee_id),
    CONSTRAINT fk_perf_cycleemp_cycle FOREIGN KEY (cycle_id) REFERENCES performance_review_cycles(id) ON DELETE CASCADE,
    CONSTRAINT fk_perf_cycleemp_employee FOREIGN KEY (employee_id) REFERENCES hrm_employees(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS performance_activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    goal_id INT NULL,
    cycle_id INT NULL,
    action VARCHAR(60) NOT NULL,
    description VARCHAR(500) NULL,
    old_status VARCHAR(40) NULL,
    new_status VARCHAR(40) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_perf_log_goal (goal_id),
    INDEX idx_perf_log_cycle (cycle_id),
    INDEX idx_perf_log_created (created_at),
    CONSTRAINT fk_perf_log_user FOREIGN KEY (user_id) REFERENCES hrm_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_perf_log_goal FOREIGN KEY (goal_id) REFERENCES performance_goals(id) ON DELETE SET NULL,
    CONSTRAINT fk_perf_log_cycle FOREIGN KEY (cycle_id) REFERENCES performance_review_cycles(id) ON DELETE SET NULL
  )`,
];

import bcrypt from 'bcryptjs';
import pool from './db.js';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS, ROLES } from './permissions.js';
import { RECRUITMENT_SCHEMA, RECRUITMENT_TABLES } from './recruitment-schema.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

// Deterministic pseudo random so the demo looks the same each seed
let seedState = 42;
const rand = () => {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

const COLORS = ['indigo', 'violet', 'sky', 'emerald', 'amber', 'rose', 'teal', 'orange'];

/* ------------------------------------------------------------------ */
/*  Demo data                                                          */
/* ------------------------------------------------------------------ */
const departments = [
  ['Engineering', 'Builds and ships the Aurora platform.', 'indigo'],
  ['Product', 'Turns customer insight into delightful products.', 'violet'],
  ['Design', 'Craft, brand and experience design.', 'rose'],
  ['Marketing', 'Growth, content and brand storytelling.', 'amber'],
  ['Sales', 'Revenue, partnerships and new markets.', 'emerald'],
  ['People & Culture', 'Hiring, culture and employee experience.', 'sky'],
  ['Finance', 'Planning, payroll and financial operations.', 'teal'],
  ['Customer Success', 'Onboarding and long-term customer happiness.', 'orange'],
];

// [first, last, dept index, designation, annual salary, join date, status, gender]
const employeeSeeds = [
  ['Sarah', 'Chen', 0, 'Senior Frontend Engineer', 128000, '2023-03-14', 'active', 'female'],
  ['Marcus', 'Rivera', 0, 'Backend Engineer', 118000, '2023-07-02', 'active', 'male'],
  ['Priya', 'Nair', 0, 'Engineering Manager', 156000, '2022-11-21', 'active', 'female'],
  ['Daniel', 'Okafor', 0, 'DevOps Engineer', 122000, '2024-01-08', 'active', 'male'],
  ['Elena', 'Petrova', 0, 'QA Engineer', 96000, '2024-06-17', 'active', 'female'],
  ['Liam', 'Foster', 0, 'Full-stack Engineer', 112000, '2025-02-10', 'active', 'male'],
  ['Aarav', 'Mehta', 0, 'Junior Developer', 72000, '2026-06-01', 'probation', 'male'],

  ['Olivia', 'Bennett', 1, 'Head of Product', 164000, '2022-08-15', 'active', 'female'],
  ['Noah', 'Williams', 1, 'Product Manager', 124000, '2023-05-22', 'active', 'male'],
  ['Mia', 'Rodriguez', 1, 'Product Analyst', 88000, '2024-09-03', 'active', 'female'],

  ['Ava', 'Thompson', 2, 'Design Lead', 138000, '2022-09-12', 'active', 'female'],
  ['Leo', 'Martins', 2, 'Product Designer', 102000, '2024-03-25', 'active', 'male'],
  ['Hana', 'Sato', 2, 'UX Researcher', 94000, '2025-05-19', 'active', 'female'],

  ['Amelia', 'Hart', 5, 'People & Culture Director', 148000, '2022-06-01', 'active', 'female'],
  ['Grace', 'Kim', 5, 'HR Specialist', 78000, '2024-11-11', 'active', 'female'],
  ['Ethan', 'Brooks', 5, 'Talent Partner', 84000, '2025-08-04', 'active', 'male'],

  ['Lucas', 'Andersen', 3, 'Marketing Manager', 108000, '2023-01-30', 'active', 'male'],
  ['Chloe', 'Dubois', 3, 'Content Strategist', 82000, '2024-07-08', 'on-leave', 'female'],
  ['Ravi', 'Kapoor', 3, 'Growth Marketer', 86000, '2025-10-13', 'active', 'male'],

  ['Isabella', 'Moretti', 4, 'Sales Director', 152000, '2022-10-04', 'active', 'female'],
  ['James', 'Carter', 4, 'Account Executive', 98000, '2023-12-12', 'active', 'male'],
  ['Sofia', 'Almeida', 4, 'Sales Development Rep', 68000, '2026-05-18', 'active', 'female'],

  ['Benjamin', 'Clarke', 6, 'Finance Manager', 116000, '2022-12-05', 'active', 'male'],
  ['Nora', 'Hassan', 6, 'Payroll Specialist', 74000, '2025-01-20', 'active', 'female'],

  ['Zoe', 'Nguyen', 7, 'Customer Success Lead', 104000, '2023-09-11', 'active', 'female'],
  ['Owen', 'Grant', 7, 'Support Specialist', 62000, '2026-07-06', 'active', 'male'],
  ['Aria', 'Fischer', 7, 'Onboarding Manager', 88000, '2024-04-15', 'active', 'female'],

  ['Kai', 'Tanaka', 0, 'Staff Engineer', 142000, '2026-08-24', 'active', 'male'],
  ['Layla', 'Haddad', 2, 'Brand Designer', 90000, '2026-10-05', 'active', 'female'],
  ['Mateo', 'Silva', 4, 'Enterprise AE', 106000, '2026-09-14', 'active', 'male'],
];

const today = new Date();
today.setHours(0, 0, 0, 0);
const currentYear = today.getFullYear();

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */
const schema = [
  `CREATE TABLE hrm_departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL UNIQUE,
    description VARCHAR(255),
    color VARCHAR(24) DEFAULT 'indigo',
    head_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE hrm_employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_code VARCHAR(20) NOT NULL UNIQUE,
    first_name VARCHAR(60) NOT NULL,
    last_name VARCHAR(60) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    phone VARCHAR(30),
    gender ENUM('male','female','other') DEFAULT 'other',
    date_of_birth DATE NULL,
    address VARCHAR(180),
    city VARCHAR(80),
    country VARCHAR(80) DEFAULT 'United States',
    department_id INT NULL,
    designation VARCHAR(100),
    employment_type ENUM('full-time','part-time','contract','intern') DEFAULT 'full-time',
    status ENUM('active','on-leave','probation','inactive') DEFAULT 'active',
    join_date DATE,
    salary DECIMAL(12,2) DEFAULT 0,
    avatar_color VARCHAR(24) DEFAULT 'indigo',
    bio VARCHAR(300),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_emp_dept (department_id),
    INDEX idx_emp_status (status),
    CONSTRAINT fk_emp_dept FOREIGN KEY (department_id) REFERENCES hrm_departments(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE hrm_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'employee',
    employee_id INT NULL,
    avatar_color VARCHAR(24) DEFAULT 'indigo',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    last_login DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_emp FOREIGN KEY (employee_id) REFERENCES hrm_employees(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE hrm_attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    date DATE NOT NULL,
    check_in TIME NULL,
    check_out TIME NULL,
    status ENUM('present','late','remote','half-day','absent') NOT NULL DEFAULT 'present',
    work_hours DECIMAL(4,1) DEFAULT 0,
    notes VARCHAR(255) NULL,
    UNIQUE KEY uniq_att (employee_id, date),
    CONSTRAINT fk_att_emp FOREIGN KEY (employee_id) REFERENCES hrm_employees(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE hrm_leaves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    type ENUM('annual','sick','personal','maternity','unpaid') NOT NULL DEFAULT 'annual',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days DECIMAL(4,1) NOT NULL,
    reason VARCHAR(400),
    status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_leave_emp FOREIGN KEY (employee_id) REFERENCES hrm_employees(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE hrm_payroll (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    month CHAR(7) NOT NULL,
    basic DECIMAL(12,2) NOT NULL,
    allowances DECIMAL(12,2) NOT NULL DEFAULT 0,
    bonus DECIMAL(12,2) NOT NULL DEFAULT 0,
    deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
    net_pay DECIMAL(12,2) NOT NULL,
    status ENUM('pending','paid') NOT NULL DEFAULT 'pending',
    paid_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_pay (employee_id, month),
    CONSTRAINT fk_pay_emp FOREIGN KEY (employee_id) REFERENCES hrm_employees(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE hrm_role_permissions (
    role VARCHAR(32) NOT NULL,
    permission VARCHAR(64) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (role, permission)
  )`,
  `CREATE TABLE hrm_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    actor_id INT NULL,
    actor_name VARCHAR(100) NULL,
    actor_role VARCHAR(32) NULL,
    action VARCHAR(80) NOT NULL,
    entity VARCHAR(40) NULL,
    entity_id VARCHAR(40) NULL,
    details JSON NULL,
    ip VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_created (created_at),
    INDEX idx_audit_actor (actor_id),
    INDEX idx_audit_action (action)
  )`,
];

/* ------------------------------------------------------------------ */
/*  Seed                                                               */
/* ------------------------------------------------------------------ */
async function seed() {
  const conn = await pool.getConnection();
  try {
    console.log('→ Dropping existing Aurora tables…');
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    const recruitmentTables = [...RECRUITMENT_TABLES].reverse();
    for (const t of [...recruitmentTables, 'hrm_audit_logs', 'hrm_role_permissions', 'hrm_payroll', 'hrm_leaves', 'hrm_attendance', 'hrm_users', 'hrm_employees', 'hrm_departments']) {
      await conn.query(`DROP TABLE IF EXISTS ${t}`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('→ Creating schema…');
    for (const stmt of schema) await conn.query(stmt);
    for (const stmt of RECRUITMENT_SCHEMA) await conn.query(stmt);

    console.log('→ Inserting departments…');
    const deptIds = [];
    for (const [name, description, color] of departments) {
      const [r] = await conn.query(
        'INSERT INTO hrm_departments (name, description, color) VALUES (?, ?, ?)',
        [name, description, color]
      );
      deptIds.push(r.insertId);
    }

    console.log('→ Inserting employees…');
    const empIds = [];
    const employeeRows = [];
    let counter = 1001;
    for (const [first, last, deptIdx, designation, salary, joinDate, status, gender] of employeeSeeds) {
      const email = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@aurorahr.com';
      const color = COLORS[deptIdx % COLORS.length];
      const city = pick(['San Francisco', 'New York', 'Austin', 'Seattle', 'Chicago', 'Boston', 'Denver']);
      const phone = `+1 (415) ${between(200, 989)}-${between(1000, 9899)}`;
      const dobYear = between(1985, 1999);
      const dob = `${dobYear}-${pad(between(1, 12))}-${pad(between(1, 28))}`;
      const bio = pick([
        'Passionate about building thoughtful products and strong teams.',
        'Coffee enthusiast, systems thinker and lifelong learner.',
        'Focused on craft, clarity and customer outcomes.',
        'Believes great culture is a competitive advantage.',
        'Turning complex problems into simple, elegant solutions.',
      ]);
      const [r] = await conn.query(
        `INSERT INTO hrm_employees
         (employee_code, first_name, last_name, email, phone, gender, date_of_birth, address, city, country,
          department_id, designation, employment_type, status, join_date, salary, avatar_color, bio)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          `EMP-${counter++}`,
          first,
          last,
          email,
          phone,
          gender,
          dob,
          `${between(12, 980)} ${pick(['Market St', 'Oak Ave', 'Pine St', 'Bay Rd', 'Lake Blvd'])}`,
          city,
          'United States',
          deptIds[deptIdx],
          designation,
          designation.includes('Intern') || designation.includes('Junior') ? 'full-time' : pick(['full-time', 'full-time', 'full-time', 'contract']),
          status,
          joinDate,
          salary,
          color,
          bio,
        ]
      );
      empIds.push(r.insertId);
      employeeRows.push({ id: r.insertId, first, last, deptIdx, salary, joinDate, status, color });
    }

    // department heads
    const heads = {
      0: 'Priya Nair',
      1: 'Olivia Bennett',
      2: 'Ava Thompson',
      3: 'Lucas Andersen',
      4: 'Isabella Moretti',
      5: 'Amelia Hart',
      6: 'Benjamin Clarke',
      7: 'Zoe Nguyen',
    };
    for (const [idx, fullName] of Object.entries(heads)) {
      const [first, last] = fullName.split(' ');
      const emp = employeeRows.find((e) => e.first === first && e.last === last);
      if (emp) await conn.query('UPDATE hrm_departments SET head_id = ? WHERE id = ?', [emp.id, deptIds[Number(idx)]]);
    }

    console.log('→ Creating user accounts…');
    const hash = (pw) => bcrypt.hashSync(pw, 10);
    const sarah = employeeRows.find((e) => e.first === 'Sarah');
    const amelia = employeeRows.find((e) => e.first === 'Amelia');
    const grace = employeeRows.find((e) => e.first === 'Grace');
    const olivia = employeeRows.find((e) => e.first === 'Olivia');
    const benjamin = employeeRows.find((e) => e.first === 'Benjamin');

    const accounts = [
      ['Amelia Hart', 'admin@aurorahr.com', 'admin123', 'super_admin', amelia.id, 'indigo'],
      ['Olivia Bennett', 'ceo@aurorahr.com', 'ceo123456', 'ceo', olivia.id, 'violet'],
      ['Benjamin Clarke', 'office@aurorahr.com', 'office123456', 'administration', benjamin.id, 'emerald'],
      ['Grace Kim', 'hr@aurorahr.com', 'hr123456', 'hr', grace.id, 'sky'],
      ['Sarah Chen', 'sarah@aurorahr.com', 'employee123', 'employee', sarah.id, 'amber'],
    ];
    for (const [name, email, password, role, employeeId, color] of accounts) {
      await conn.query(
        `INSERT INTO hrm_users (name, email, password_hash, role, employee_id, avatar_color, is_active)
         VALUES (?,?,?,?,?,?,1)`,
        [name, email, hash(password), role, employeeId, color]
      );
    }

    // Role permission matrix
    for (const role of ROLES.map((r) => r.key)) {
      const defaultPerms = DEFAULT_ROLE_PERMISSIONS[role] || [];
      const recruitmentPerms = role === 'super_admin'
        ? PERMISSION_KEYS.filter((key) => key.startsWith('recruitment.'))
        : defaultPerms.filter((key) => key.startsWith('recruitment.'));
      const allPerms = [...defaultPerms, ...recruitmentPerms].filter(
        (perm, idx, arr) => arr.indexOf(perm) === idx
      );
      for (const permission of allPerms) {
        await conn.query(
          'INSERT INTO hrm_role_permissions (role, permission) VALUES (?, ?)',
          [role, permission]
        );
      }
    }

    console.log('→ Generating attendance…');
    const statuses = ['present', 'present', 'present', 'present', 'present', 'late', 'remote', 'absent', 'half-day'];
    for (const emp of employeeRows) {
      if (emp.status === 'inactive') continue;
      for (let d = 1; d <= 60; d++) {
        const day = addDays(today, -d);
        const dow = day.getDay();
        if (dow === 0 || dow === 6) continue;
        // recent joiner: skip dates before joining
        if (new Date(emp.joinDate) > day) continue;
        let status = pick(statuses);
        // keep it realistic: fewer absences
        if (status === 'absent' && rand() > 0.35) status = 'present';
        const inHour = status === 'late' ? between(9, 10) : between(8, 9);
        const inMin = between(0, 59);
        const work = status === 'absent' ? 0 : status === 'half-day' ? 4 : Number((7 + rand() * 2).toFixed(1));
        const outHour = status === 'half-day' ? 13 : Math.min(19, inHour + Math.floor(work) + (inMin + Math.round((work % 1) * 60) >= 60 ? 1 : 0));
        const checkIn = `${pad(inHour)}:${pad(inMin)}:00`;
        const checkOut = status === 'absent' ? null : `${pad(outHour)}:${pad(between(0, 59))}:00`;
        await conn.query(
          `INSERT INTO hrm_attendance (employee_id, date, check_in, check_out, status, work_hours)
           VALUES (?,?,?,?,?,?)`,
          [emp.id, iso(day), status === 'absent' ? null : checkIn, checkOut, status, work]
        );
      }
    }

    // today's attendance — a realistic mix, some still clocked in
    let todayIndex = 0;
    for (const emp of employeeRows) {
      if (emp.status === 'inactive' || emp.status === 'on-leave') continue;
      const roll = rand();
      if (todayIndex % 5 === 4) {
        todayIndex++;
        continue; // not clocked in yet
      }
      let status = roll > 0.88 ? 'late' : roll > 0.82 ? 'remote' : 'present';
      const inHour = status === 'late' ? 9 : 8;
      const checkIn = `${pad(inHour)}:${pad(between(10, 58))}:00`;
      const checkedOut = rand() > 0.55;
      const checkOut = checkedOut ? `1${between(7, 9)}:${pad(between(0, 59))}:00` : null;
      const work = checkedOut ? Number((8 + rand()).toFixed(1)) : 0;
      await conn.query(
        `INSERT INTO hrm_attendance (employee_id, date, check_in, check_out, status, work_hours)
         VALUES (?,?,?,?,?,?)`,
        [emp.id, iso(today), checkIn, checkOut, status, work]
      );
      todayIndex++;
    }

    console.log('→ Creating leave requests…');
    const leaveSeeds = [
      [0, 'annual', 12, 16, 'Family trip to the coast.', 'approved'],
      [1, 'sick', 3, 3, 'Flu recovery, doctor advised rest.', 'approved'],
      [7, 'annual', 20, 24, 'Wedding anniversary getaway.', 'approved'],
      [15, 'personal', 2, 2, 'Apartment move.', 'pending'],
      [20, 'annual', 9, 13, 'Visiting family overseas.', 'pending'],
      [4, 'sick', 1, 2, 'Migraine and fever.', 'approved'],
      [10, 'annual', 27, 30, 'Autumn break with the kids.', 'pending'],
      [17, 'unpaid', 5, 9, 'Personal sabbatical days.', 'rejected'],
      [23, 'personal', 15, 15, 'Civic duty / jury duty.', 'approved'],
      [8, 'annual', 7, 8, 'Short city break.', 'approved'],
      [13, 'annual', -3, 2, 'Extended weekend.', 'approved'],
      [16, 'annual', 18, 22, 'Hiking in the Rockies.', 'pending'],
      [26, 'sick', 6, 6, 'Dental procedure.', 'approved'],
      [5, 'personal', 11, 11, 'Volunteering at local school.', 'pending'],
    ];
    for (const [empIdx, type, startOffset, endOffset, reason, status] of leaveSeeds) {
      const start = addDays(today, startOffset);
      const end = addDays(today, endOffset);
      const days = Math.round((end - start) / 86400000) + 1;
      const emp = employeeRows[empIdx];
      await conn.query(
        `INSERT INTO hrm_leaves (employee_id, type, start_date, end_date, days, reason, status, reviewed_by, reviewed_at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          emp.id,
          type,
          iso(start),
          iso(end),
          days,
          reason,
          status,
          status === 'approved' || status === 'rejected' ? amelia.id : null,
          status === 'approved' || status === 'rejected' ? new Date(Date.now() - 2 * 86400000) : null,
          new Date(Date.now() - (status === 'pending' ? between(1, 4) : between(5, 25)) * 86400000),
        ]
      );
    }

    console.log('→ Generating payroll…');
    for (let m = 0; m < 4; m++) {
      const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const month = monthKey(d);
      for (const emp of employeeRows) {
        if (new Date(emp.joinDate) > d) continue;
        const monthly = Math.round(emp.salary / 12);
        const allowances = Math.round(monthly * 0.12);
        const bonus = m === 0 && rand() > 0.7 ? Math.round(monthly * 0.15) : 0;
        const deductions = Math.round(monthly * 0.08);
        const net = monthly + allowances + bonus - deductions;
        const paid = m > 0 || rand() > 0.4;
        await conn.query(
          `INSERT INTO hrm_payroll (employee_id, month, basic, allowances, bonus, deductions, net_pay, status, paid_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [emp.id, month, monthly, allowances, bonus, deductions, net, paid ? 'paid' : 'pending', paid ? new Date(Date.now() - between(2, 12) * 86400000) : null]
        );
      }
    }

    console.log('\n✅ Seed complete!');
    console.log('   Accounts:');
    console.log('   • Super Admin    → admin@aurorahr.com / admin123');
    console.log('   • CEO            → ceo@aurorahr.com / ceo123456');
    console.log('   • Administration → office@aurorahr.com / office123456');
    console.log('   • HR             → hr@aurorahr.com / hr123456');
    console.log('   • Employee       → sarah@aurorahr.com / employee123');
  } finally {
    conn.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

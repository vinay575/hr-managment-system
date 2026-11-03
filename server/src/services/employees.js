import pool from '../db.js';
import { ApiError } from '../utils.js';

/**
 * Shared employee creation helpers.
 *
 * Both Employee Management and recruitment conversion use these so the
 * EMP-#### convention and column handling stay in a single place.
 */

export const EMPLOYEE_FIELDS = [
  'first_name', 'last_name', 'email', 'phone', 'gender', 'date_of_birth', 'address', 'city', 'country',
  'department_id', 'designation', 'employment_type', 'status', 'join_date', 'salary', 'avatar_color', 'bio',
];

export const EMPLOYEE_SELECT = `
  SELECT e.*, d.name AS department_name, d.color AS department_color
  FROM hrm_employees e
  LEFT JOIN hrm_departments d ON d.id = e.department_id
`;

export async function nextEmployeeCode(db = pool) {
  const [[row]] = await db.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(employee_code, 5) AS UNSIGNED)), 1000) AS maxCode
     FROM hrm_employees WHERE employee_code LIKE 'EMP-%'`
  );
  return `EMP-${Number(row.maxCode) + 1}`;
}

/**
 * Insert an employee. `db` may be the pool or an open transaction connection.
 * Returns { id, employeeCode }.
 */
export async function insertEmployee(db, body = {}) {
  for (const key of ['first_name', 'last_name', 'email', 'designation', 'join_date']) {
    if (!body[key]) throw new ApiError(400, `${key.replace('_', ' ')} is required.`);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email))
    throw new ApiError(400, 'Please enter a valid email address.');

  const code = body.employee_code || (await nextEmployeeCode(db));

  const values = EMPLOYEE_FIELDS.map((f) => {
    if (body[f] === undefined || body[f] === '') return null;
    if (f === 'salary') return Number(body[f]) || 0;
    if (f === 'department_id') return Number(body[f]) || null;
    return body[f];
  });

  try {
    const [result] = await db.query(
      `INSERT INTO hrm_employees (employee_code, ${EMPLOYEE_FIELDS.join(', ')})
       VALUES (?, ${EMPLOYEE_FIELDS.map(() => '?').join(', ')})`,
      [code, ...values]
    );
    return { id: result.insertId, employeeCode: code };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      throw new ApiError(409, 'An employee with that email or code already exists.');
    throw err;
  }
}

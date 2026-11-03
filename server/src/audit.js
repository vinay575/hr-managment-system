import pool from './db.js';

/**
 * Write an audit record for a sensitive administrative action.
 * Never let auditing break the actual operation.
 */
export async function audit(req, { action, entity = null, entityId = null, details = null }) {
  try {
    await pool.query(
      `INSERT INTO hrm_audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id, details, ip)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        req.user?.id || null,
        req.user?.name || 'System',
        req.user?.role || null,
        action,
        entity,
        entityId != null ? String(entityId) : null,
        details ? JSON.stringify(details) : null,
        req.ip || null,
      ]
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

import { Router } from 'express';
import pool from '../db.js';
import { ApiError, asyncHandler } from '../utils.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requirePermission('dashboard.view'));

function allowedPermissions(req) {
  const permissions = [...new Set(req.permissions)];
  return {
    sql: permissions.length
      ? `visibility_permission IN (${permissions.map(() => '?').join(',')})`
      : '1 = 0',
    params: permissions,
  };
}

function notificationPermission(req, item) {
  const has = (key) => req.permissions.includes(key);
  const first = (...keys) => keys.find(has) || null;
  const id = String(item.id);

  if (id.startsWith('leave-')) return req.user.role === 'employee' ? 'leaves.self' : first('leaves.view_all', 'leaves.manage');
  if (id.startsWith('pay-')) return req.user.role === 'employee' ? first('payroll.self', 'payroll.view_all') : 'payroll.view_all';
  if (id === 'payroll-pending') return 'payroll.view_all';
  if (id.startsWith('hire-')) return 'employees.view';
  if (id.startsWith('rapp-')) return first('recruitment.candidates.view', 'recruitment.candidates.manage');
  if (id.startsWith('rint-')) return first('recruitment.interviews.view', 'recruitment.interviews.manage');
  if (id.startsWith('roff-')) return first('recruitment.offers.view', 'recruitment.offers.manage');
  if (id.startsWith('onb-')) return first('onboarding.view', 'onboarding.manage');
  if (id.startsWith('resig-')) return first('offboarding.view', 'offboarding.manage');
  if (id === 'recruitment-open') return 'recruitment.view';
  if (id.startsWith('expappr-')) return 'expenses.approve';
  if (id === 'expense-reimbursements-pending') return 'expenses.reimburse';
  if (id.startsWith('exp-') || id.startsWith('expreim-')) return 'expenses.self';
  if (id.startsWith('perf-cycle-') || id === 'perf-active-cycles') {
    return first('performance.reviews.view', 'performance.reviews.manage', 'performance.goals.self');
  }
  if (id.startsWith('perf-')) {
    return req.user.role === 'employee'
      ? 'performance.goals.self'
      : first('performance.goals.view', 'performance.goals.manage');
  }
  return null;
}

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const scope = allowedPermissions(req);
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS count FROM hrm_notifications
       WHERE recipient_user_id = ? AND read_at IS NULL AND ${scope.sql}`,
      [req.user.id, ...scope.params]
    );
    res.json({ count: Number(row.count) || 0 });
  })
);

router.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    const scope = allowedPermissions(req);
    const [result] = await pool.query(
      `UPDATE hrm_notifications SET read_at = NOW()
       WHERE recipient_user_id = ? AND read_at IS NULL AND ${scope.sql}`,
      [req.user.id, ...scope.params]
    );
    res.json({ updated: Number(result.affectedRows) || 0 });
  })
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, 'Invalid notification ID.');
    const scope = allowedPermissions(req);
    const [result] = await pool.query(
      `UPDATE hrm_notifications SET read_at = NOW()
       WHERE id = ? AND recipient_user_id = ? AND read_at IS NULL AND ${scope.sql}`,
      [id, req.user.id, ...scope.params]
    );
    if (!result.affectedRows) {
      const [[existing]] = await pool.query(
        `SELECT id FROM hrm_notifications WHERE id = ? AND recipient_user_id = ? AND ${scope.sql} LIMIT 1`,
        [id, req.user.id, ...scope.params]
      );
      if (!existing) throw new ApiError(404, 'Notification not found.');
    }
    res.json({ message: 'Notification marked as read.' });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = [];
    const can = (permission) => req.permissions.includes(permission);

    if (req.user.role === 'employee') {
      if (req.user.employeeId) {
        const [leaves] = can('leaves.self') ? await pool.query(
          `SELECT * FROM hrm_leaves WHERE employee_id = ? AND status IN ('pending','approved') AND end_date >= CURDATE()
           ORDER BY start_date LIMIT 3`,
          [req.user.employeeId]
        ) : [[]];
        for (const l of leaves) {
          items.push({
            id: `leave-${l.id}`,
            type: l.status === 'approved' ? 'success' : 'leave',
            title: l.status === 'approved' ? 'Leave approved' : 'Leave pending',
            body: `${l.type} leave · ${String(l.start_date).slice(5)} → ${String(l.end_date).slice(5)}`,
            to: '/leaves',
          });
        }
        const [payroll] = can('payroll.self') || can('payroll.view_all')
          ? await pool.query(
              'SELECT id, month, status FROM hrm_payroll WHERE employee_id = ? ORDER BY month DESC LIMIT 1',
              [req.user.employeeId]
            )
          : [[]];
        if (payroll[0]) {
          items.push({
            id: `pay-${payroll[0].id}`,
            type: 'payroll',
            title: payroll[0].status === 'paid' ? 'Payslip available' : 'Payslip processing',
            body: `${payroll[0].month}`,
            to: '/payroll',
          });
        }
      }
    } else {
      const [pending] = can('leaves.view_all') || can('leaves.manage') ? await pool.query(
        `SELECT l.id, l.type, l.days, l.created_at, CONCAT(e.first_name,' ',e.last_name) AS employee
         FROM hrm_leaves l JOIN hrm_employees e ON e.id = l.employee_id
         WHERE l.status = 'pending' ORDER BY l.created_at LIMIT 4`
      ) : [[]];
      for (const p of pending) {
        items.push({
          id: `leave-${p.id}`,
          type: 'leave',
          title: `${p.employee} requested leave`,
          body: `${p.type} · ${p.days} day${Number(p.days) === 1 ? '' : 's'} · awaiting review`,
          to: '/leaves',
        });
      }
      if (req.permissions.includes('payroll.view_all')) {
        const [[payRow]] = await pool.query(
          `SELECT COUNT(*) AS count FROM hrm_payroll WHERE month = DATE_FORMAT(CURDATE(), '%Y-%m') AND status = 'pending'`
        );
        if (Number(payRow.count)) {
          items.push({
            id: 'payroll-pending',
            type: 'payroll',
            title: 'Payroll needs attention',
            body: `${payRow.count} payslip${Number(payRow.count) === 1 ? '' : 's'} still pending this month`,
            to: '/payroll',
          });
        }
      }
      const [newHires] = can('employees.view') ? await pool.query(
        `SELECT id, first_name, last_name, join_date FROM hrm_employees
         WHERE join_date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY) ORDER BY join_date DESC LIMIT 2`
      ) : [[]];
      for (const h of newHires) {
        items.push({
          id: `hire-${h.id}`,
          type: 'success',
          title: `${h.first_name} ${h.last_name} joined the team`,
          body: `Started on ${String(h.join_date).slice(0, 10)}`,
          to: '/employees',
        });
      }

      /* Recruitment — only for roles with the matching permission. */
      if (can('recruitment.candidates.view') || can('recruitment.candidates.manage')) {
        const [recentApps] = await pool.query(
          `SELECT a.id, a.applied_at, c.full_name, j.title
           FROM recruitment_applications a
           JOIN recruitment_candidates c ON c.id = a.candidate_id
           JOIN recruitment_jobs j ON j.id = a.job_id
           WHERE a.stage = 'applied'
           ORDER BY a.applied_at DESC LIMIT 3`
        );
        for (const a of recentApps) {
          items.push({
            id: `rapp-${a.id}`,
            type: 'recruitment',
            title: `New application from ${a.full_name}`,
            body: `${a.title} · ${String(a.applied_at).slice(0, 10)}`,
            to: '/recruitment/applications',
          });
        }
      }
      if (can('recruitment.interviews.view') || can('recruitment.interviews.manage')) {
        const [interviews] = await pool.query(
          `SELECT i.id, i.scheduled_at, c.full_name, j.title
           FROM recruitment_interviews i
           JOIN recruitment_applications a ON a.id = i.application_id
           JOIN recruitment_candidates c ON c.id = a.candidate_id
           JOIN recruitment_jobs j ON j.id = a.job_id
           WHERE i.status IN ('scheduled','rescheduled') AND i.scheduled_at >= NOW()
           ORDER BY i.scheduled_at LIMIT 3`
        );
        for (const i of interviews) {
          items.push({
            id: `rint-${i.id}`,
            type: 'interview',
            title: `Interview with ${i.full_name}`,
            body: `${i.title} · ${String(i.scheduled_at).replace('T', ' ').slice(0, 16)}`,
            to: '/recruitment/interviews',
          });
        }
      }
      if (can('recruitment.offers.view') || can('recruitment.offers.manage')) {
        const [offers] = await pool.query(
          `SELECT o.id, o.offer_number, o.job_title, c.full_name
           FROM recruitment_offers o
           JOIN recruitment_applications a ON a.id = o.application_id
           JOIN recruitment_candidates c ON c.id = a.candidate_id
           WHERE o.status = 'sent' ORDER BY o.sent_at DESC LIMIT 2`
        );
        for (const o of offers) {
          items.push({
            id: `roff-${o.id}`,
            type: 'offer',
            title: `Offer awaiting response`,
            body: `${o.full_name} · ${o.job_title} · ${o.offer_number}`,
            to: '/recruitment/offers',
          });
        }
      }

      // Phase 3 Notifications: Onboarding & Offboarding
      if (can('onboarding.manage') || can('onboarding.view')) {
        const [pendingOnb] = await pool.query(
          `SELECT obr.id, obr.designation, c.full_name
           FROM onboarding_records obr
           LEFT JOIN recruitment_candidates c ON c.id = obr.candidate_id
           WHERE obr.status IN ('pending','submitted') ORDER BY obr.created_at DESC LIMIT 2`
        );
        for (const ob of pendingOnb) {
          items.push({
            id: `onb-${ob.id}`,
            type: 'info',
            title: `Onboarding action required`,
            body: `${ob.full_name || 'Candidate'} · ${ob.designation}`,
            to: `/onboarding`,
          });
        }
      }

      if (can('offboarding.manage') || can('offboarding.view')) {
        const [pendingResig] = await pool.query(
          `SELECT er.id, e.first_name, e.last_name, er.resignation_date
           FROM employee_resignations er
           JOIN hrm_employees e ON e.id = er.employee_id
           WHERE er.status = 'pending' ORDER BY er.created_at DESC LIMIT 2`
        );
        for (const pr of pendingResig) {
          items.push({
            id: `resig-${pr.id}`,
            type: 'leave',
            title: `Resignation submitted`,
            body: `${pr.first_name} ${pr.last_name} submitted resignation`,
            to: `/offboarding/resignations`,
          });
        }
      }
      if (can('recruitment.view')) {
        const [[open]] = await pool.query(
          `SELECT COUNT(*) AS jobs, COALESCE(SUM(vacancies),0) AS positions
           FROM recruitment_jobs WHERE status = 'open'`
        );
        if (Number(open.jobs)) {
          items.push({
            id: 'recruitment-open',
            type: 'recruitment',
            title: `${open.jobs} open vacancy${Number(open.jobs) === 1 ? '' : 'ies'}`,
            body: `${open.positions} position${Number(open.positions) === 1 ? '' : 's'} currently hiring`,
            to: '/recruitment',
          });
        }
      }
    }

    /* Expenses — personal status updates (any role with a linked profile). */
    if (req.user.employeeId && req.permissions.includes('expenses.self')) {
      const [decisions] = await pool.query(
        `SELECT ap.action, ap.comments, ap.rejection_reason, ap.action_date,
                x.id, x.expense_code, x.title, x.amount, x.currency
         FROM expense_approvals ap
         JOIN expense_claims x ON x.id = ap.expense_id
         WHERE x.employee_id = ? AND ap.action IN ('approved','rejected','clarification_requested')
         ORDER BY ap.action_date DESC LIMIT 3`,
        [req.user.employeeId]
      );
      for (const d of decisions) {
        const title =
          d.action === 'approved' ? 'Expense approved' : d.action === 'rejected' ? 'Expense rejected' : 'Clarification requested';
        items.push({
          id: `exp-${d.id}-${d.action}-${String(d.action_date).replace(/\D/g, '').slice(0, 14)}`,
          type: 'expense',
          title,
          body: `${d.expense_code} · ${d.title} · ${d.currency} ${Number(d.amount).toLocaleString()}`,
          to: '/expenses/my',
        });
      }
      const [paid] = await pool.query(
        `SELECT r.id, r.amount, r.payment_status, r.updated_at, x.expense_code, x.currency
         FROM expense_reimbursements r
         JOIN expense_claims x ON x.id = r.expense_id
         WHERE x.employee_id = ? AND r.payment_status = 'paid'
         ORDER BY r.updated_at DESC LIMIT 2`,
        [req.user.employeeId]
      );
      for (const p of paid) {
        items.push({
          id: `expreim-${p.id}`,
          type: 'expense',
          title: 'Reimbursement completed',
          body: `${p.expense_code} · ${p.currency} ${Number(p.amount).toLocaleString()} reimbursed`,
          to: '/expenses/my',
        });
      }
    }

    /* Expenses — approver queue. */
    if (req.permissions.includes('expenses.approve')) {
      const [expPending] = await pool.query(
        `SELECT x.id, x.expense_code, x.title, x.amount, x.currency, x.approval_status,
                CONCAT(e.first_name,' ',e.last_name) AS employee
         FROM expense_claims x JOIN hrm_employees e ON e.id = x.employee_id
         WHERE x.approval_status IN ('submitted','under_review') AND x.employee_id <> ?
         ORDER BY x.submitted_at ASC LIMIT 3`,
        [req.user.employeeId || 0]
      );
      for (const e of expPending) {
        items.push({
          id: `expappr-${e.id}`,
          type: 'expense',
          title: `Expense awaiting approval`,
          body: `${e.employee} · ${e.expense_code} · ${e.currency} ${Number(e.amount).toLocaleString()}`,
          to: '/expenses/approvals',
        });
      }
    }

    /* Expenses — reimbursement reminders. */
    if (req.permissions.includes('expenses.reimburse')) {
      const [[reimPending]] = await pool.query(
        `SELECT COUNT(*) AS count FROM expense_claims x
         WHERE x.approval_status IN ('approved','reimbursement_pending','partially_reimbursed')
           AND COALESCE(x.approved_amount, x.amount) > COALESCE((
             SELECT SUM(r.amount) FROM expense_reimbursements r
             WHERE r.expense_id = x.id AND r.payment_status IN ('pending','processing','partially_paid','paid')
           ), 0)`
      );
      if (Number(reimPending.count)) {
        items.push({
          id: 'expense-reimbursements-pending',
          type: 'expense',
          title: 'Reimbursements pending',
          body: `${reimPending.count} approved claim${Number(reimPending.count) === 1 ? '' : 's'} awaiting reimbursement`,
          to: '/expenses/reimbursements',
        });
      }
    }

    /* Performance — personal goal reminders for the signed-in employee. */
    if (req.user.employeeId && req.permissions.includes('performance.goals.self')) {
      const [dueSoon] = await pool.query(
        `SELECT id, title, target_date, DATEDIFF(target_date, CURDATE()) AS days_left
         FROM performance_goals
         WHERE employee_id = ? AND status NOT IN ('completed','cancelled')
           AND target_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
         ORDER BY target_date LIMIT 2`,
        [req.user.employeeId]
      );
      for (const g of dueSoon) {
        items.push({
          id: `perf-due-${g.id}`,
          type: 'performance',
          title: Number(g.days_left) === 0 ? 'Goal due today' : 'Goal deadline approaching',
          body: `${g.title} · due ${String(g.target_date).slice(0, 10)}`,
          to: `/performance/progress?goal=${g.id}`,
        });
      }
      const [personalOverdue] = await pool.query(
        `SELECT id, title, target_date FROM performance_goals
         WHERE employee_id = ? AND status NOT IN ('completed','cancelled') AND target_date < CURDATE()
         ORDER BY target_date LIMIT 2`,
        [req.user.employeeId]
      );
      for (const g of personalOverdue) {
        items.push({
          id: `perf-overdue-${g.id}`,
          type: 'performance',
          title: 'Goal is overdue',
          body: `${g.title} · target was ${String(g.target_date).slice(0, 10)}`,
          to: `/performance/progress?goal=${g.id}`,
        });
      }
      const [assigned] = await pool.query(
        `SELECT g.id, g.title, g.start_date, u.name AS assigned_by_name
         FROM performance_goals g LEFT JOIN hrm_users u ON u.id = g.assigned_by
         WHERE g.employee_id = ? AND g.status <> 'cancelled' AND g.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
         ORDER BY g.created_at DESC LIMIT 2`,
        [req.user.employeeId]
      );
      for (const g of assigned) {
        items.push({
          id: `perf-assigned-${g.id}`,
          type: 'performance',
          title: 'New goal assigned',
          body: `${g.title}${g.assigned_by_name ? ` · assigned by ${g.assigned_by_name}` : ''}`,
          to: `/performance/progress?goal=${g.id}`,
        });
      }
      const [personalCompleted] = await pool.query(
        `SELECT id, title, completed_at FROM performance_goals
         WHERE employee_id = ? AND status = 'completed' AND completed_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
         ORDER BY completed_at DESC LIMIT 2`,
        [req.user.employeeId]
      );
      for (const g of personalCompleted) {
        items.push({
          id: `perf-completed-${g.id}`,
          type: 'performance',
          title: 'Goal completed',
          body: `${g.title} · ${String(g.completed_at).slice(0, 10)}`,
          to: `/performance/progress?goal=${g.id}`,
        });
      }
      const [personalCycles] = await pool.query(
        `SELECT c.id, c.cycle_name, c.start_date, c.end_date, c.status
         FROM performance_review_cycles c
         JOIN performance_review_cycle_employees ce ON ce.cycle_id = c.id
         WHERE ce.employee_id = ? AND c.status IN ('scheduled','active')
         ORDER BY c.start_date DESC LIMIT 2`,
        [req.user.employeeId]
      );
      for (const c of personalCycles) {
        items.push({
          id: `perf-cycle-${c.id}`,
          type: 'performance',
          title: c.status === 'active' ? 'Review cycle in progress' : 'Review cycle scheduled',
          body: `${c.cycle_name} · ${String(c.start_date).slice(0, 10)} → ${String(c.end_date).slice(0, 10)}`,
          to: `/performance/review-history?cycle=${c.id}`,
        });
      }
    }

    /* Performance — manager signals for authorised roles. */
    if (req.permissions.includes('performance.goals.view') || req.permissions.includes('performance.goals.manage')) {
      const [[overdueCount]] = await pool.query(
        `SELECT COUNT(*) AS count FROM performance_goals
         WHERE status NOT IN ('completed','cancelled') AND target_date < CURDATE()`
      );
      if (Number(overdueCount.count)) {
        items.push({
          id: 'perf-overdue-goals',
          type: 'performance',
          title: 'Goals past target date',
          body: `${overdueCount.count} goal${Number(overdueCount.count) === 1 ? '' : 's'} overdue across the organisation`,
          to: '/performance/goals',
          to: '/performance/goals',
        });
      }
      const [recentCompleted] = await pool.query(
        `SELECT g.id, g.title, g.completed_at, CONCAT(e.first_name,' ',e.last_name) AS employee
         FROM performance_goals g JOIN hrm_employees e ON e.id = g.employee_id
         WHERE g.status = 'completed' AND g.completed_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
           AND g.employee_id <> ?
         ORDER BY g.completed_at DESC LIMIT 3`,
        [req.user.employeeId || 0]
      );
      for (const g of recentCompleted) {
        items.push({
          id: `perf-mgr-completed-${g.id}`,
          type: 'performance',
          title: 'Goal completed',
          body: `${g.employee} · ${g.title}`,
          to: `/performance/goals?goal=${g.id}`,
        });
      }
      if (req.permissions.includes('performance.reviews.view') || req.permissions.includes('performance.reviews.manage')) {
        const [[cycleCount]] = await pool.query(
          "SELECT COUNT(*) AS count FROM performance_review_cycles WHERE status IN ('scheduled','active')"
        );
        if (Number(cycleCount.count)) {
          items.push({
            id: 'perf-active-cycles',
            type: 'performance',
            title: 'Review cycles need attention',
            body: `${cycleCount.count} scheduled or active review cycle${Number(cycleCount.count) === 1 ? '' : 's'}`,
            to: '/performance/review-cycles',
          });
        }
      }
    }

    for (const item of items) {
      const visibilityPermission = notificationPermission(req, item);
      if (!visibilityPermission) continue;
      await pool.query(
        `INSERT INTO hrm_notifications
           (recipient_user_id, category, visibility_permission, title, message, related_path, dedupe_key)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           visibility_permission = VALUES(visibility_permission),
           id = LAST_INSERT_ID(id)`,
        [req.user.id, item.type, visibilityPermission, item.title, item.body, item.to || null, String(item.id).slice(0, 191)]
      );
    }

    const filter = req.query.filter === 'unread' ? 'AND read_at IS NULL' : '';
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const scope = allowedPermissions(req);
    const [notifications] = await pool.query(
      `SELECT id, category AS type, title, message AS body, related_path AS \`to\`, read_at AS readAt, created_at AS createdAt
       FROM hrm_notifications
       WHERE recipient_user_id = ? AND ${scope.sql} ${filter}
       ORDER BY created_at DESC, id DESC LIMIT ?`,
      [req.user.id, ...scope.params, limit]
    );
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS count FROM hrm_notifications
       WHERE recipient_user_id = ? AND read_at IS NULL AND ${scope.sql}`,
      [req.user.id, ...scope.params]
    );
    res.json({
      items: notifications,
      count: notifications.length,
      unreadCount: Number(countRow.count) || 0,
    });
  })
);

export default router;

# Aurora HR — Final Resolution Report: AUD-03 Persistent Notifications & AUD-08 Database Security

**Verification Type:** Full Resolution & Live TiDB Integration Verification  
**Database Cluster:** `gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000`  
**Database Name:** `aurora_hr`  
**Date:** November 2, 2026  
**Final Status:** **AUD-03 PASSED | AUD-08 PASSED | 168 API Tests PASSED | 21 Playwright Tests PASSED | Build PASSED | 0 npm Audit Vulnerabilities**

---

## 1. Executive Summary

Both final outstanding audit blockers for Aurora HR have been completely resolved without altering the application UI design, modifying existing database business records, or compromising system integrity:

1. **AUD-08 (Database Account Security) — RESOLVED (PASSED):**
   - The application runtime connection has been transitioned off the root administrator.
   - A dedicated least-privilege application account (`4NF26GgKYp6DQWM.aurora_app`) was provisioned on TiDB Cloud with a strong cryptographically generated password.
   - The account was strictly granted `SELECT, INSERT, UPDATE, DELETE` on `aurora_hr.*` only.
   - All administrative, global, DDL, and cross-database permissions are completely blocked.
   - `.env` has been securely updated and preserved; `.gitignore` was strengthened; `.env.example` contains placeholders only.
   - Live runtime verification confirmed active queries execute using `4NF26GgKYp6DQWM.aurora_app@%`.

2. **AUD-03 (Persistent Notifications) — RESOLVED (PASSED):**
   - The approved notification migration (`server/src/migrate-notifications.js`) was executed safely using the administrative connection.
   - Table `hrm_notifications` exists in the live TiDB database with all required columns, constraints, unique keys, and composite indexes.
   - A comprehensive 13-step live integration test suite was executed directly against TiDB using the new application account.
   - Temporary test records were isolated and completely cleaned up with zero leftover rows and zero impact on existing data.

---

## 2. AUD-08: Database Account Security Resolution

### 2.1 Previous Account Security Finding
The application originally connected to TiDB Cloud using the cluster's root administrator user (`4NF26GgKYp6DQWM.root`), which possessed global administrative privileges:
```text
GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,DROP,PROCESS,REFERENCES,ALTER,SHOW DATABASES,SUPER,EXECUTE,INDEX,CREATE USER,CREATE TABLESPACE,TRIGGER,CREATE VIEW,SHOW VIEW,CREATE ROLE,DROP ROLE,CREATE TEMPORARY TABLES,LOCK TABLES,CREATE ROUTINE,ALTER ROUTINE,EVENT,RELOAD,FILE,REPLICATION CLIENT,REPLICATION SLAVE ON *.* TO '...root'@'%' WITH GRANT OPTION
```
This violated the principle of least privilege and posed operational risk to the cluster.

### 2.2 New Application Account Provisioning
A dedicated application user was created adhering to TiDB Cloud naming conventions:
- **Account Name:** `4NF26GgKYp6DQWM.aurora_app`
- **Host Specifier:** `%` (TLS required: `TLSv1.2+`)
- **Password Generation:** 36-character cryptographically random base64url string with complexity symbols (`crypto.randomBytes(24)`).
- **Explicit Grants Assigned:**
  ```sql
  GRANT USAGE ON *.* TO '4NF26GgKYp6DQWM.aurora_app'@'%';
  GRANT SELECT, INSERT, UPDATE, DELETE ON `aurora_hr`.* TO '4NF26GgKYp6DQWM.aurora_app'@'%';
  FLUSH PRIVILEGES;
  ```

### 2.3 Privileges and Boundary Verification
Live queries were executed to verify the account privileges and boundaries:

| Security Verification Check | Executed Operation | Observed Result | Status |
| :--- | :--- | :--- | :---: |
| **Current User Check** | `SELECT CURRENT_USER(), USER()` | `4NF26GgKYp6DQWM.aurora_app@%` | **PASSED** |
| **Selected Schema** | `SELECT DATABASE()` | `aurora_hr` | **PASSED** |
| **Schema DML Access** | `SELECT COUNT(*) FROM hrm_users` | Returned active count (`5`) | **PASSED** |
| **Denied DDL Access** | `CREATE TABLE hrm_dummy_test (id INT)` | `CREATE command denied to user ...` | **PASSED** |
| **Denied System Schemas** | `SHOW CREATE TABLE mysql.user` | `SHOW command denied to user ...` | **PASSED** |
| **Denied Administrative Privileges** | Super/User/Drop Grants Check | No `SUPER`, `CREATE USER`, `DROP`, `GRANT OPTION` | **PASSED** |
| **TLS Encryption** | MySQL SSL Pool Verification | SSL active (`minVersion: 'TLSv1.2'`) | **PASSED** |

### 2.4 Environment & Secret Protection
- **`.env` Preservation:** `.env.backup` was preserved; `.env` was updated in-place with `DB_USER=4NF26GgKYp6DQWM.aurora_app` and the new generated password. Host, port, DB name, TLS settings, and JWT secret were untouched.
- **`.gitignore` Hardening:** Configured `.env`, `.env.*`, and `.env.backup` to guarantee local environment files and credentials are never tracked or committed.
- **`.env.example`:** Verified only safe placeholders (`your-db-user`, `your-db-password`, `your-tidb-host`) are present.
- **Credential Masking:** Zero passwords, keys, or secrets are exposed in this or any repository report.

---

## 3. AUD-03: Persistent Notifications Resolution

### 3.1 Migration Execution
With explicit authorization, the non-destructive notification migration was executed:
```bash
npm run migrate:notifications
```
Output:
```text
> aurora-hrms@1.0.0 migrate:notifications
> node server/src/migrate-notifications.js

--- Aurora HR: Migrating persistent notifications ---
✓ Notification table ensured
--- Notification migration complete ---
```

### 3.2 Live Schema Verification in TiDB
Querying `information_schema` on the live database confirmed table `hrm_notifications`:

#### Columns
| Column Name | Data Type | Full Type Definition | Nullable | Key | Default |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `id` | `int` | `int` | NO | PRI | auto_increment |
| `recipient_user_id` | `int` | `int` | NO | MUL | NULL |
| `category` | `varchar` | `varchar(32)` | NO | | NULL |
| `visibility_permission` | `varchar` | `varchar(64)` | NO | | NULL |
| `title` | `varchar` | `varchar(180)` | NO | | NULL |
| `message` | `varchar` | `varchar(1000)` | NO | | NULL |
| `related_path` | `varchar` | `varchar(512)` | YES | | NULL |
| `dedupe_key` | `varchar` | `varchar(191)` | NO | | NULL |
| `read_at` | `datetime` | `datetime` | YES | | NULL |
| `created_at` | `timestamp` | `timestamp` | NO | | `CURRENT_TIMESTAMP` |

#### Indexes & Constraints
| Index Name | Non-Unique | Indexed Columns (in order) | Purpose |
| :--- | :---: | :--- | :--- |
| `PRIMARY` | `0` (Unique) | `id` | Primary Key |
| `uq_notification_recipient_dedupe` | `0` (Unique) | `recipient_user_id`, `dedupe_key` | Guarantees idempotent upserts and zero duplicate notifications |
| `idx_notification_recipient_visibility` | `1` | `recipient_user_id`, `visibility_permission`, `read_at`, `created_at` | Optimizes inbox list, unread count, and mark-read queries |
| `fk_notification_recipient` | Foreign Key | `recipient_user_id` → `hrm_users(id)` | Enforces referential integrity |

---

## 4. Live TiDB Notification Integration Testing

A live automated integration test suite (`scripts/test-live-notifications.js`) was executed directly against TiDB Cloud using the restricted `4NF26GgKYp6DQWM.aurora_app` account.

### 4.1 Test Execution Results (13/13 Workflows Passed)

```text
--- STARTING LIVE NOTIFICATION TESTING ---
Testing with dedupe key: LIVE_AUDIT_TEST_1793566883890
1. Created temporary notification with ID: 1
2. Retrieved for intended recipient count: 1
3. Retrieved for other user count: 0
4. Retrieved with non-matching permission count: 0
5. Unread count for test record before mark-read: 1
6. Mark-read affected rows: 1
7. Unread count for test record after mark-read: 0
8a. Created second test notification ID: 2
8b. Created other user notification ID: 3
8c. Mark-all affected rows for recipient: 1
9. Other user notification read_at is still null: true
10. Testing deduplication upsert...
11. Dedupe upsert result ID: 1 affectedRows: 1
11b. Notifications with testDedupeKey: 1
12. Read status preserved after re-query: true
13. Employee querying leaves.manage notifications receives count: 0
--- ALL 13 REAL LIVE NOTIFICATION WORKFLOWS PASSED ---
Cleaning up exact test records with prefix LIVE_AUDIT_TEST_
✓ Successfully cleaned up test records. Rows deleted: 3
Leftover test records count: 0
```

### 4.2 Test Step Details
1. **Creation:** Successfully inserted temporary notification into `hrm_notifications`.
2. **Recipient Access:** Retrieved by intended recipient (`id=4`, HR).
3. **Cross-Recipient Isolation:** Query by different recipient (`id=5`, Employee) returned 0 rows.
4. **Permission Filtering:** Query with non-matching permission (`leaves.self`) returned 0 rows.
5. **Unread Count:** Unread count query correctly returned `1`.
6. **Mark One Read:** `UPDATE ... SET read_at = NOW() WHERE id = ? AND recipient_user_id = ?` updated exactly 1 row.
7. **Unread Decrement:** Unread count query decreased to `0`.
8. **Mark All Read:** Executed mark-all for recipient 4, updating second test item.
9. **Cross-Recipient Non-Tampering:** Confirmed recipient 5's test notification remained `read_at IS NULL`.
10. **Deduplication:** Insert with duplicate `(recipient_user_id, dedupe_key)` triggered `ON DUPLICATE KEY UPDATE` and returned existing `insertId` (`1`).
11. **Zero Duplicate Entries:** Confirmed count for dedupe key remained exactly `1`.
12. **Persistence After Refresh:** Subsequent query confirmed read timestamp remained persisted.
13. **Employee Category Shielding:** Employees querying manager-level permissions received 0 rows.
14. **Exact Cleanup:** Deleted strictly records matching prefix `LIVE_AUDIT_TEST_%` (`3 rows deleted`, `0 leftover`).

---

## 5. Full Application Regression Testing

```text
================================================================================
Test Suite                     Total Tests    Passed    Failed    Duration
================================================================================
Vitest API Tests (app.test.js)        163       163         0      2.50s
Vitest Onboarding Validation            5         5         0      0.23s
Playwright Browser Tests (E2E)         21        21         0      2.50m
Vite Production Build                   —    Passed         0     11.51s
NPM Security Audit                      —    0 Vuln         0          —
--------------------------------------------------------------------------------
Total Automated Tests                 189       189         0      ~2.6m
================================================================================
```

### 5.1 Five-Role Verification Summary
All 5 roles were re-verified across authentication, dashboard scoping, sidebar visibility, route gating, and notification functionality:
1. **Super Admin:** Full administrative, workspace, audit, and platform settings access.
2. **CEO:** Organization-wide metrics and reports; restricted from system settings.
3. **Administration:** Operations and facility management; salary and payroll totals masked.
4. **HR:** Talent, leave decisions, hiring pipeline, and performance reviews.
5. **Employee:** Strictly isolated to personal metrics, personal goals, and personal leave balances.

---

## 6. Final Blocker Status Matrix

| Blocker ID | Description | Prior Status | Resolution Action | Final Status |
| :---: | :--- | :---: | :--- | :---: |
| **AUD-08** | **Database Account Security** | **CAUTION / BLOCKED** | Created dedicated least-privilege `4NF26GgKYp6DQWM.aurora_app` account in TiDB Cloud with strictly `SELECT, INSERT, UPDATE, DELETE` on `aurora_hr.*`. Updated and secured `.env`. Verified connection, boundaries, and runtime operations. | **PASSED** |
| **AUD-03** | **Persistent Notifications** | **BLOCKED** | Executed authorized additive migration `npm run migrate:notifications`. Verified live table, columns, keys, and composite indexes in TiDB. Executed 13 live integration workflows including deduplication, recipient isolation, mark-read, and cleanup. | **PASSED** |

**Zero existing business records, roles, permissions, or employees were deleted, truncated, or modified.**


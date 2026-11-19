import { beforeEach, describe, expect, it, vi } from 'vitest';

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock('../../server/src/db.js', () => ({
  default: { query: poolQuery },
  testConnection: vi.fn(),
}));

const {
  ackStats,
  audienceClause,
  normalizeAudience,
  normalizeCategory,
  notifyAnnouncement,
  parsePublishAt,
  publishDueAnnouncements,
  sqlDateTime,
  statusCounts,
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_STATUSES,
} = await import('../../server/src/services/announcements.js');
const { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS } = await import('../../server/src/permissions.js');
const { ApiError } = await import('../../server/src/utils.js');

beforeEach(() => {
  poolQuery.mockReset();
  poolQuery.mockImplementation(async () => [[], []]);
});

describe('announcement validation helpers', () => {
  it('accepts browser datetime-local values and normalises them for MySQL', () => {
    expect(parsePublishAt('2026-12-01T09:30')).toBe('2026-12-01 09:30:00');
    expect(parsePublishAt('2026-12-01 09:30:15')).toBe('2026-12-01 09:30:15');
    expect(parsePublishAt('')).toBeNull();
  });

  it('rejects impossible or malformed scheduled dates', () => {
    expect(() => parsePublishAt('2026-02-31T09:00')).toThrow(ApiError);
    expect(() => parsePublishAt('tomorrow')).toThrow(ApiError);
    expect(() => parsePublishAt('2026-12-01T25:00')).toThrow(ApiError);
  });

  it('falls back to safe category and audience defaults', () => {
    expect(normalizeCategory('HR')).toBe('hr');
    expect(normalizeCategory('important')).toBe('important');
    expect(normalizeCategory('unknown')).toBeNull();
    expect(normalizeAudience('DEPARTMENT')).toBe('department');
    expect(normalizeAudience('nobody')).toBeNull();
  });

  it('scopes department announcements to a single department', () => {
    expect(audienceClause({ audience: 'everyone' })).toEqual({ sql: "e.status <> 'inactive'", params: [] });
    expect(audienceClause({ audience: 'department', department_id: 4 })).toEqual({
      sql: "e.status <> 'inactive' AND e.department_id = ?",
      params: [4],
    });
  });

  it('computes status and acknowledgment statistics', () => {
    expect(statusCounts([
      { status: 'published' },
      { status: 'published' },
      { status: 'scheduled' },
      { status: 'archived' },
    ])).toMatchObject({ total: 4, published: 2, scheduled: 1, archived: 1, draft: 0 });

    expect(ackStats([
      { status: 'acknowledged' },
      { status: 'pending' },
      { status: 'acknowledged' },
    ])).toEqual({ targeted: 3, acknowledged: 2, pending: 1, completion: 67 });
    expect(ackStats([])).toEqual({ targeted: 0, acknowledged: 0, pending: 0, completion: 0 });
  });

  it('stores local wall-clock timestamps', () => {
    expect(sqlDateTime(new Date(2026, 0, 5, 7, 8, 9))).toBe('2026-01-05 07:08:09');
  });

  it('ships all required categories and statuses', () => {
    expect(ANNOUNCEMENT_CATEGORIES.map((c) => c.key)).toEqual(['general', 'hr', 'holiday', 'policy', 'important']);
    expect(ANNOUNCEMENT_STATUSES.map((s) => s.key)).toEqual(['draft', 'scheduled', 'published', 'archived']);
  });
});

describe('announcement notifications', () => {
  it('sends one deduplicated notification per targeted user', async () => {
    poolQuery.mockImplementation(async (sql) => {
      const query = String(sql);
      if (query.includes('SELECT DISTINCT u.id AS user_id')) return [[{ user_id: 11 }, { user_id: 12 }], []];
      if (query.includes('INSERT INTO hrm_notifications')) return [{ affectedRows: 1 }, []];
      return [[], []];
    });

    const sent = await notifyAnnouncement({
      id: 5,
      status: 'published',
      title: 'Office closure',
      content: 'The office is closed on Friday.',
      audience: 'everyone',
    });

    expect(sent).toBe(2);
    const inserts = poolQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO hrm_notifications'));
    expect(inserts).toHaveLength(2);
    expect(inserts.every(([, params]) => params.includes('announcement-5'))).toBe(true);
    expect(inserts.every(([, params]) => params.includes('announcement'))).toBe(true);
    expect(inserts.every(([sql]) => String(sql).includes('ON DUPLICATE KEY UPDATE'))).toBe(true);
  });

  it('never notifies for drafts or archived announcements', async () => {
    expect(await notifyAnnouncement({ id: 1, status: 'draft', title: 'x', content: 'y' })).toBe(0);
    expect(await notifyAnnouncement({ id: 2, status: 'archived', title: 'x', content: 'y' })).toBe(0);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('publishes only due scheduled rows and notifies once', async () => {
    poolQuery.mockImplementation(async (sql, params = []) => {
      const query = String(sql);
      if (query.includes("WHERE status = 'scheduled' AND publish_at IS NOT NULL AND publish_at <= ?")) {
        return [[{ id: 8 }], []];
      }
      if (query.includes("SET status = 'published'")) return [{ affectedRows: 1 }, []];
      if (query.includes('SELECT * FROM announcements WHERE id = ?')) {
        return [[{ id: 8, status: 'published', title: 'Live now', content: 'Body', audience: 'everyone' }], []];
      }
      if (query.includes('SELECT DISTINCT u.id AS user_id')) return [[{ user_id: 21 }], []];
      if (query.includes('INSERT INTO hrm_notifications')) return [{ affectedRows: 1 }, []];
      return [[], []];
    });

    const result = await publishDueAnnouncements();
    expect(result).toEqual({ published: 1, notified: 1 });
    const update = poolQuery.mock.calls.find(([sql]) => String(sql).includes("SET status = 'published'"));
    expect(String(update[0])).toContain("AND status = 'scheduled'");
    expect(update[1]).toEqual([expect.any(String), 8]);
  });
});

describe('announcement permission matrix', () => {
  it('registers all announcement permissions', () => {
    for (const key of ['announcements.view', 'announcements.manage', 'announcements.reports', 'announcements.self']) {
      expect(PERMISSION_KEYS).toContain(key);
    }
  });

  it('keeps employees to their own feed only', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.employee).toContain('announcements.self');
    expect(DEFAULT_ROLE_PERMISSIONS.employee).not.toContain('announcements.view');
    expect(DEFAULT_ROLE_PERMISSIONS.employee).not.toContain('announcements.manage');
    expect(DEFAULT_ROLE_PERMISSIONS.employee).not.toContain('announcements.reports');
  });

  it('gives CEO company-wide management and reports', () => {
    for (const key of ['announcements.view', 'announcements.manage', 'announcements.reports', 'announcements.self']) {
      expect(DEFAULT_ROLE_PERMISSIONS.ceo).toContain(key);
    }
  });

  it('gives HR management, reports and the employee feed', () => {
    for (const key of ['announcements.view', 'announcements.manage', 'announcements.reports', 'announcements.self']) {
      expect(DEFAULT_ROLE_PERMISSIONS.hr).toContain(key);
    }
  });

  it('lets administration manage notices without the acknowledgment report', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.administration).toContain('announcements.manage');
    expect(DEFAULT_ROLE_PERMISSIONS.administration).toContain('announcements.view');
    expect(DEFAULT_ROLE_PERMISSIONS.administration).not.toContain('announcements.reports');
  });
});

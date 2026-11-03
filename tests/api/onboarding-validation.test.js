import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import request from 'supertest';

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock('../../server/src/db.js', () => ({
  default: { query: poolQuery },
  testConnection: vi.fn(),
}));

const { createApp } = await import('../../server/src/app.js');
const { DOC_UPLOAD_DIR } = await import('../../server/src/services/document-storage.js');

const app = createApp();
const password = 'isolated-test-password';
const admin = {
  id: 1,
  name: 'Admin Test',
  email: 'admin@example.test',
  role: 'super_admin',
  employee_id: null,
  avatar_color: 'indigo',
  is_active: 1,
  last_login: null,
  password_hash: '',
};
let baselineUploads = new Set();

const listUploads = () => new Set(fs.readdirSync(DOC_UPLOAD_DIR));

beforeAll(async () => {
  process.env.JWT_SECRET = 'aurora-hr-api-tests-only-secret';
  admin.password_hash = await bcrypt.hash(password, 4);
  baselineUploads = listUploads();
});

beforeEach(() => {
  poolQuery.mockReset();
  poolQuery.mockImplementation(async (sql) => {
    const query = String(sql).replace(/\s+/g, ' ').trim();

    if (query.includes('FROM hrm_users WHERE email = ?')) {
      return [[admin], []];
    }
    if (query.includes('FROM hrm_users WHERE id = ? LIMIT 1')) {
      return [[admin], []];
    }
    if (query.includes('FROM onboarding_records WHERE id = ?')) {
      return [[{ id: 7, employee_id: 1005 }], []];
    }
    if (/^\s*SELECT/i.test(query)) {
      return [[], []];
    }
    return [{ affectedRows: 1, insertId: 9001 }, []];
  });
});

afterEach(() => {
  for (const filename of listUploads()) {
    if (!baselineUploads.has(filename)) {
      fs.rmSync(`${DOC_UPLOAD_DIR}/${filename}`, { force: true });
    }
  }
});

async function signIn() {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: admin.email, password });
  expect(response.status).toBe(200);
  return response.body.token;
}

const templatePayload = (overrides = {}) => ({
  name: 'Validation template',
  type: 'full_time',
  tasks: [
    { title: 'Collect identity proof', category: 'DOCUMENT VERIFICATION', due_days: 2 },
  ],
  ...overrides,
});

const insertCalls = () =>
  poolQuery.mock.calls.filter(([sql]) => /^\s*INSERT/i.test(String(sql)));

describe('Onboarding enum validation', () => {
  it('accepts a valid template type and task category', async () => {
    const token = await signIn();
    poolQuery.mockClear();

    const response = await request(app)
      .post('/api/onboarding/templates')
      .set('Authorization', `Bearer ${token}`)
      .send(templatePayload());

    expect(response.status).toBe(201);
    expect(response.body.id).toBe(9001);
    const templateInserts = insertCalls().filter(([sql]) =>
      String(sql).includes('INSERT INTO onboarding_templates')
    );
    expect(templateInserts).toHaveLength(1);
    expect(templateInserts[0][1]).toContain('full_time');
    expect(insertCalls().some(([sql]) =>
      String(sql).includes('INSERT INTO onboarding_template_tasks')
    )).toBe(true);
  });

  it('rejects an invalid template type before any database write', async () => {
    const token = await signIn();
    poolQuery.mockClear();

    const response = await request(app)
      .post('/api/onboarding/templates')
      .set('Authorization', `Bearer ${token}`)
      .send(templatePayload({ type: 'permanent' }));

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Invalid template type/i);
    expect(response.body.message).toMatch(/full_time/i);
    expect(insertCalls()).toHaveLength(0);
  });

  it('rejects an invalid task category before inserting the template', async () => {
    const token = await signIn();
    poolQuery.mockClear();

    const response = await request(app)
      .post('/api/onboarding/templates')
      .set('Authorization', `Bearer ${token}`)
      .send(templatePayload({
        tasks: [{ title: 'Bad task', category: 'UNKNOWN CATEGORY' }],
      }));

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Invalid task category/i);
    expect(insertCalls()).toHaveLength(0);
  });

  it('accepts a valid document type and stores the record', async () => {
    const token = await signIn();
    poolQuery.mockClear();

    const response = await request(app)
      .post('/api/onboarding/records/7/documents')
      .set('Authorization', `Bearer ${token}`)
      .field('doc_type', 'pan_card')
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'pan.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(201);
    const documentInserts = insertCalls().filter(([sql]) =>
      String(sql).includes('INSERT INTO onboarding_documents')
    );
    expect(documentInserts).toHaveLength(1);
    expect(documentInserts[0][1]).toContain('pan_card');
  });

  it('rejects an invalid document type, writes nothing, and removes the upload', async () => {
    const token = await signIn();
    const before = listUploads();
    poolQuery.mockClear();

    const response = await request(app)
      .post('/api/onboarding/records/7/documents')
      .set('Authorization', `Bearer ${token}`)
      .field('doc_type', 'passport_scan')
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'invalid.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Invalid document type/i);
    expect(response.body.message).toMatch(/pan_card/i);
    expect(insertCalls()).toHaveLength(0);
    expect(listUploads()).toEqual(before);
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../server/src/db.js', () => ({
  default: { query: vi.fn() },
  testConnection: vi.fn(),
}));

const { expiryInfo, settingFlag, toCsv, csvEscape, documentHash } = await import('../../server/src/services/documents.js');
const { validateDocumentContent, safeOriginalName, normalizedMime } = await import('../../server/src/document-upload.js');
const { buildStorageKey } = await import('../../server/src/services/document-store.js');
const { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS } = await import('../../server/src/permissions.js');
const { DEFAULT_DOCUMENT_CATEGORIES, DEFAULT_DOCUMENT_SETTINGS } = await import('../../server/src/document-schema.js');
const { ApiError } = await import('../../server/src/utils.js');

const iso = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('document expiry tracking', () => {
  it('classifies expired, expiring and valid documents', () => {
    expect(expiryInfo(iso(-2), 30).key).toBe('expired');
    expect(expiryInfo(iso(10), 30).key).toBe('expiring');
    expect(expiryInfo(iso(90), 30).key).toBe('valid');
  });

  it('respects the configured warning window', () => {
    expect(expiryInfo(iso(10), 7).key).toBe('valid');
    expect(expiryInfo(iso(10), 30).key).toBe('expiring');
  });

  it('treats a missing or invalid date as no expiry', () => {
    expect(expiryInfo(null).key).toBe('none');
    expect(expiryInfo('not-a-date').key).toBe('none');
  });
});

describe('document upload security', () => {
  const file = (name, buffer) => ({ originalname: name, buffer, mimetype: 'application/octet-stream', size: buffer.length });

  it('accepts files whose content signature matches the extension', () => {
    expect(validateDocumentContent(file('a.pdf', Buffer.from('%PDF-1.7 test')))).toBe('.pdf');
    expect(validateDocumentContent(file('a.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2])))).toBe('.png');
    expect(validateDocumentContent(file('a.jpg', Buffer.from([0xff, 0xd8, 0xff, 1])))).toBe('.jpg');
    expect(validateDocumentContent(file('a.docx', Buffer.from([0x50, 0x4b, 3, 4])))).toBe('.docx');
  });

  it('rejects content that contradicts the extension', () => {
    expect(() => validateDocumentContent(file('fake.pdf', Buffer.from('MZ executable')))).toThrow(ApiError);
    expect(() => validateDocumentContent(file('fake.png', Buffer.from('%PDF-1.7')))).toThrow(ApiError);
  });

  it('sanitises user-supplied names and never keeps path traversal', () => {
    expect(safeOriginalName('../../etc/passwd')).toBe('passwd');
    expect(safeOriginalName('C:\\temp\\invoice.pdf')).toBe('invoice.pdf');
    expect(safeOriginalName('bad<>:"/\\|?*name.pdf')).not.toMatch(/[<>:"/\\|?*]/);
    expect(safeOriginalName('')).toBe('document');
  });

  it('stores files under a generated internal key, not the original filename', () => {
    const key = buildStorageKey('../../secret/passport.pdf', 'application/pdf');
    expect(key).toMatch(/^documents\/\d{4}\/\d{2}\/[0-9a-f-]+\.pdf$/);
    expect(key).not.toContain('passport');
    expect(key).not.toContain('..');
  });

  it('normalises MIME types from the validated extension', () => {
    expect(normalizedMime({ originalname: 'a.pdf', mimetype: 'application/octet-stream' })).toBe('application/pdf');
    expect(normalizedMime({ originalname: 'a.JPG', mimetype: 'image/jpeg' })).toBe('image/jpeg');
  });
});

describe('document helpers', () => {
  it('exports CSV with correct escaping', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('a"b')).toBe('"a""b"');
    const csv = toCsv(['Name', 'Note'], [['A', 'line1\nline2']]);
    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('"line1\nline2"');
  });

  it('hashes file contents deterministically', () => {
    const a = documentHash(Buffer.from('same'));
    expect(a).toHaveLength(64);
    expect(documentHash(Buffer.from('same'))).toBe(a);
    expect(documentHash(Buffer.from('different'))).not.toBe(a);
  });

  it('parses setting flags safely', () => {
    expect(settingFlag('1')).toBe(true);
    expect(settingFlag(true)).toBe(true);
    expect(settingFlag('0')).toBe(false);
    expect(settingFlag(undefined)).toBe(false);
  });
});

describe('document permission matrix', () => {
  it('registers all document permissions', () => {
    for (const key of [
      'documents.view',
      'documents.manage',
      'documents.verify',
      'documents.categories.manage',
      'documents.reports',
      'documents.settings',
      'documents.self',
    ]) {
      expect(PERMISSION_KEYS).toContain(key);
    }
  });

  it('limits employees to their own documents', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.employee).toContain('documents.self');
    expect(DEFAULT_ROLE_PERMISSIONS.employee).not.toContain('documents.view');
    expect(DEFAULT_ROLE_PERMISSIONS.employee).not.toContain('documents.manage');
    expect(DEFAULT_ROLE_PERMISSIONS.employee).not.toContain('documents.verify');
  });

  it('gives CEO read and reporting without full management', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.ceo).toContain('documents.view');
    expect(DEFAULT_ROLE_PERMISSIONS.ceo).toContain('documents.reports');
    expect(DEFAULT_ROLE_PERMISSIONS.ceo).not.toContain('documents.settings');
    expect(DEFAULT_ROLE_PERMISSIONS.ceo).not.toContain('documents.categories.manage');
  });

  it('gives HR the full operational document toolkit', () => {
    for (const key of ['documents.view', 'documents.manage', 'documents.verify', 'documents.categories.manage', 'documents.reports', 'documents.settings', 'documents.self']) {
      expect(DEFAULT_ROLE_PERMISSIONS.hr).toContain(key);
    }
  });
});

describe('document defaults', () => {
  it('ships a required-category catalogue with unique slugs', () => {
    expect(DEFAULT_DOCUMENT_CATEGORIES.length).toBeGreaterThan(10);
    const slugs = DEFAULT_DOCUMENT_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(DEFAULT_DOCUMENT_CATEGORIES.some((c) => c.required === 1)).toBe(true);
  });

  it('ships safe default settings', () => {
    expect(DEFAULT_DOCUMENT_SETTINGS.documents_enabled).toBe('1');
    expect(Number(DEFAULT_DOCUMENT_SETTINGS.max_upload_mb)).toBeLessThanOrEqual(25);
    expect(DEFAULT_DOCUMENT_SETTINGS.allowed_extensions).not.toContain('exe');
    expect(Number(DEFAULT_DOCUMENT_SETTINGS.expiry_warning_days)).toBeGreaterThan(0);
  });
});

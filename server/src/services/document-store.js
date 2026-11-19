import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError } from '../utils.js';

/**
 * Private document storage.
 *
 * Primary: Backblaze B2 (private bucket, authenticated native API).
 * Fallback: private local disk storage, used for local development and the
 * isolated test suite where B2 credentials are intentionally absent.
 *
 * Files are never exposed through a public URL. Every read goes through an
 * authenticated, permission-checked API endpoint.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
export const LOCAL_DOCUMENT_DIR = path.resolve(here, '../../uploads');
fs.mkdirSync(LOCAL_DOCUMENT_DIR, { recursive: true });

const B2_KEY_ID = () => process.env.B2_KEY_ID || '';
const B2_APPLICATION_KEY = () => process.env.B2_APPLICATION_KEY || '';
const B2_BUCKET_NAME = () => process.env.B2_BUCKET_NAME || 'kodewar-hrms-documents';

export const isB2Configured = () => Boolean(B2_KEY_ID() && B2_APPLICATION_KEY());

let cache = null;
let authPromise = null;

function b2Error(message, status = 502) {
  return new ApiError(status, message || 'Document storage is temporarily unavailable. Please try again.');
}

async function b2Json(url, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw b2Error('Could not reach the document storage provider.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON response */
  }
  if (!res.ok) {
    const message = data?.message || `Storage request failed (${res.status}).`;
    throw b2Error(`Document storage error: ${message}`);
  }
  return data;
}

async function authorize() {
  if (cache && cache.expiresAt > Date.now()) return cache;
  cache = null;
  if (authPromise) return authPromise;

  authPromise = (async () => {
    const basic = Buffer.from(`${B2_KEY_ID()}:${B2_APPLICATION_KEY()}`).toString('base64');
    const data = await b2Json('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
      token: `Basic ${basic}`,
    });

    const storage = data.apiInfo?.storageApi || {};
    const state = {
      accountId: data.accountId,
      apiUrl: storage.apiUrl,
      downloadUrl: storage.downloadUrl,
      token: data.authorizationToken,
      bucketId: storage.bucketId || null,
      bucketName: storage.bucketName || null,
      expiresAt: Date.now() + 23 * 60 * 60 * 1000,
    };

    if (!state.apiUrl || !state.downloadUrl) {
      throw b2Error('Document storage authorisation response was incomplete.');
    }

    if (!state.bucketId) {
      const bucketName = B2_BUCKET_NAME();
      const listed = await b2Json(`${state.apiUrl}/b2api/v3/b2_list_buckets`, {
        method: 'POST',
        token: state.token,
        body: { accountId: state.accountId, bucketName },
      });
      const bucket = (listed.buckets || [])[0];
      if (bucket) {
        state.bucketId = bucket.bucketId;
        state.bucketName = bucket.bucketName;
      } else {
        const created = await b2Json(`${state.apiUrl}/b2api/v3/b2_create_bucket`, {
          method: 'POST',
          token: state.token,
          body: {
            accountId: state.accountId,
            bucketName,
            bucketType: 'allPrivate',
            defaultServerSideEncryption: { mode: 'SSE-B2', algorithm: 'AES256' },
          },
        });
        state.bucketId = created.bucketId;
        state.bucketName = created.bucketName;
      }
    }

    cache = state;
    return state;
  })();

  try {
    return await authPromise;
  } finally {
    authPromise = null;
  }
}

function localPath(key) {
  const safe = String(key || '')
    .split(/[\\/]+/)
    .filter((part) => part && part !== '.' && part !== '..')
    .join(path.sep);
  const full = path.resolve(LOCAL_DOCUMENT_DIR, safe);
  if (!full.startsWith(LOCAL_DOCUMENT_DIR + path.sep)) throw new ApiError(400, 'Invalid document storage key.');
  return full;
}

export function buildStorageKey(originalName = '', mimeType = '') {
  const ext = path.extname(String(originalName || '')).toLowerCase().replace(/[^.a-z0-9]/g, '');
  const now = new Date();
  const safeExt = ext || {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  }[mimeType] || '';
  return `documents/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}${safeExt}`;
}

export async function putDocument(buffer, { key, mimeType }) {
  if (!buffer?.length) throw new ApiError(400, 'The selected document is empty.');

  if (!isB2Configured()) {
    const full = localPath(key);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, buffer, { mode: 0o600 });
    return { provider: 'local', key, fileId: null };
  }

  const state = await authorize();
  const upload = await b2Json(`${state.apiUrl}/b2api/v3/b2_get_upload_url`, {
    method: 'POST',
    token: state.token,
    body: { bucketId: state.bucketId },
  });

  const sha1 = crypto.createHash('sha1').update(buffer).digest('hex');
  let res;
  try {
    res = await fetch(upload.uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: upload.authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(key),
        'Content-Type': mimeType || 'application/octet-stream',
        'X-Bz-Content-Sha1': sha1,
        'Content-Length': String(buffer.length),
      },
      body: buffer,
    });
  } catch {
    throw b2Error('Could not upload the document to secure storage.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* noop */
  }
  if (!res.ok) {
    throw b2Error(`Document upload failed: ${data?.message || res.status}`);
  }

  return { provider: 'b2', key, fileId: data.fileId || null };
}

export async function getDocumentStream({ provider, key, fileId }) {
  if (provider !== 'b2') {
    const full = localPath(key);
    if (!fs.existsSync(full)) throw new ApiError(404, 'The document file is no longer available.');
    return { type: 'file', path: full };
  }

  const state = await authorize();
  let res;
  try {
    res = await fetch(
      `${state.downloadUrl}/b2api/v3/b2_download_file_by_id?fileId=${encodeURIComponent(fileId)}`,
      { headers: { Authorization: state.token } }
    );
  } catch {
    throw b2Error('Could not retrieve the document from secure storage.');
  }
  if (!res.ok) throw new ApiError(404, 'The document file is no longer available.');
  return { type: 'web', response: res };
}

export async function deleteDocumentFile({ provider, key, fileId }) {
  try {
    if (provider !== 'b2') {
      const full = localPath(key);
      if (fs.existsSync(full)) await fsp.unlink(full);
      return;
    }
    if (!fileId) return;
    const state = await authorize();
    await b2Json(`${state.apiUrl}/b2api/v3/b2_delete_file_version`, {
      method: 'POST',
      token: state.token,
      body: { fileName: key, fileId },
    });
  } catch (err) {
    // Never let storage cleanup break the business operation.
    console.error('Document storage cleanup failed:', err.message);
  }
}

export function invalidateStorageAuth() {
  cache = null;
}

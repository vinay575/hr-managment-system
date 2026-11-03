import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { ApiError } from './utils.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Private storage - never served as static files. */
export const PERFORMANCE_FILE_DIR = path.resolve(here, '../uploads/performance_files');
fs.mkdirSync(PERFORMANCE_FILE_DIR, { recursive: true });

const ALLOWED = new Map([
  ['application/pdf', '.pdf'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PERFORMANCE_FILE_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED.get(file.mimetype) || '';
    cb(null, `${Date.now()}-${crypto.randomBytes(10).toString('hex')}${ext}`);
  },
});

export const goalAttachmentUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new ApiError(400, 'Attachments must be PDF, JPG, PNG or WEBP files.'));
    }
    cb(null, true);
  },
}).array('attachments', 5);

/** Wrap multer so its errors become normal ApiErrors. */
export function uploadGoalAttachments(req, res, next) {
  goalAttachmentUpload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    if (err.code === 'LIMIT_FILE_SIZE') return next(new ApiError(400, 'Each attachment must be 10 MB or smaller.'));
    if (err.code === 'LIMIT_FILE_COUNT') return next(new ApiError(400, 'You can upload up to 5 attachments at a time.'));
    return next(new ApiError(400, err.message || 'Could not upload the attachment.'));
  });
}

export function attachmentPath(storedName) {
  const safe = path.basename(String(storedName || ''));
  if (!safe) throw new ApiError(400, 'Invalid attachment path.');
  const full = path.join(PERFORMANCE_FILE_DIR, safe);
  if (!full.startsWith(PERFORMANCE_FILE_DIR + path.sep)) {
    throw new ApiError(400, 'Invalid attachment path.');
  }
  return full;
}

export function hashFile(fullPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
}

export function removeAttachment(storedName) {
  if (!storedName) return;
  try {
    const full = attachmentPath(storedName);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {
    /* best effort */
  }
}

export function removeUploadedFiles(files) {
  for (const file of files || []) removeAttachment(file.filename);
}

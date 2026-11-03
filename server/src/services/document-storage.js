import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { ApiError } from '../utils.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DOC_UPLOAD_DIR = path.resolve(here, '../../uploads/onboarding_docs');

fs.mkdirSync(DOC_UPLOAD_DIR, { recursive: true });

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DOC_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

export const docUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      return cb(new ApiError(400, 'Invalid file type. Allowed: PDF, JPG, PNG, WEBP, DOC, DOCX.'));
    }
    cb(null, true);
  },
}).single('file');

export function uploadDocumentMiddleware(req, res, next) {
  docUpload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    if (err.code === 'LIMIT_FILE_SIZE') return next(new ApiError(400, 'File must be 10 MB or smaller.'));
    return next(new ApiError(400, err.message || 'File upload failed.'));
  });
}

export function getDocPath(storedName) {
  const safe = path.basename(String(storedName || ''));
  const full = path.join(DOC_UPLOAD_DIR, safe);
  if (!full.startsWith(DOC_UPLOAD_DIR)) throw new ApiError(400, 'Invalid document path.');
  return full;
}


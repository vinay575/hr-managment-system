import path from 'node:path';
import multer from 'multer';
import { ApiError } from './utils.js';

/**
 * Document upload validation.
 * Files are held in memory, validated, then written to private storage.
 * User-supplied filenames are never used for storage paths.
 */
export const ALLOWED_DOCUMENT_TYPES = new Map([
  ['application/pdf', ['.pdf']],
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['application/msword', ['.doc']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['.docx']],
]);

const EXTENSION_TO_MIME = new Map([
  ['.pdf', 'application/pdf'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
]);

const MIME_ALIASES = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'application/x-pdf': 'application/pdf',
  'application/acrobat': 'application/pdf',
  'application/vnd.ms-word': 'application/msword',
  'application/zip': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream': null,
};

const HARD_LIMIT_MB = 25;

const storage = multer.memoryStorage();

export const documentUpload = multer({
  storage,
  limits: { fileSize: HARD_LIMIT_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    const mime = MIME_ALIASES[file.mimetype] ?? file.mimetype;
    if (!EXTENSION_TO_MIME.has(ext)) {
      return cb(new ApiError(400, 'Documents must be PDF, JPG, JPEG, PNG, DOC or DOCX files.'));
    }
    if (mime && ALLOWED_DOCUMENT_TYPES.has(mime) && !ALLOWED_DOCUMENT_TYPES.get(mime).includes(ext)) {
      return cb(new ApiError(400, 'The file extension and file type do not match.'));
    }
    if (mime === null && !['.doc', '.docx'].includes(ext)) {
      return cb(new ApiError(400, 'Documents must be PDF, JPG, JPEG, PNG, DOC or DOCX files.'));
    }
    cb(null, true);
  },
}).single('file');

export function uploadDocumentMiddleware(req, res, next) {
  documentUpload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    if (err.code === 'LIMIT_FILE_SIZE') return next(new ApiError(400, `File must be ${HARD_LIMIT_MB} MB or smaller.`));
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE')
      return next(new ApiError(400, 'Please upload a single document file.'));
    return next(new ApiError(400, err.message || 'Could not upload the document.'));
  });
}

/** Best-effort content sniffing: reject a file whose bytes contradict its extension. */
export function validateDocumentContent(file) {
  if (!file?.buffer?.length) throw new ApiError(400, 'Please select a document file to upload.');
  const ext = path.extname(String(file.originalname || '')).toLowerCase();
  const head = file.buffer.subarray(0, 8);

  const isPdf = head.subarray(0, 5).toString('latin1') === '%PDF-';
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const isOle = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;

  const ok =
    (ext === '.pdf' && isPdf) ||
    ((ext === '.jpg' || ext === '.jpeg') && isJpeg) ||
    (ext === '.png' && isPng) ||
    (ext === '.docx' && isZip) ||
    (ext === '.doc' && isOle);

  if (!ok) {
    throw new ApiError(400, 'The file contents do not match a valid PDF, JPG, PNG, DOC or DOCX document.');
  }
  return ext;
}

export function normalizedMime(file) {
  const ext = path.extname(String(file.originalname || '')).toLowerCase();
  return EXTENSION_TO_MIME.get(ext) || file.mimetype || 'application/octet-stream';
}

export function safeOriginalName(name) {
  return path.basename(String(name || 'document')).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').slice(0, 200);
}

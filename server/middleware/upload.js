import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { assertStorageWithinLimit } from '../services/backupSyncService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadRoot),
  filename: (req, file, cb) => {
    const safeBase = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}-${safeBase}`);
  },
});

const allowedExt = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt', '.log', '.csv',
  '.xlsx', '.xls', '.doc', '.docx', '.json', '.xml', '.sql', '.src', '.4gl', '.zip',
]);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExt.has(ext) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('text/')) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${ext || file.mimetype}`));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 },
});

/**
 * Middleware to enforce the 40 MB total Supabase/attachment storage cap
 * before accepting new file uploads.
 */
export const enforceStorageLimit = async (req, res, next) => {
  try {
    const contentLength = Number(req.headers['content-length'] || 0);
    await assertStorageWithinLimit(contentLength);
    next();
  } catch (err) {
    next(err);
  }
};

export { uploadRoot };

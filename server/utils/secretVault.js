import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function getEncryptionKey() {
  const raw = process.env.EMAIL_ENCRYPTION_KEY || process.env.JWT_SECRET || 'sage_x3_desk_dev_secret_change_in_production_2026';
  return crypto.createHash('sha256').update(String(raw)).digest();
}

/**
 * Encrypts a JSON-serializable secret object using AES-256-GCM.
 */
export function encryptSecret(payload) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const plaintext = JSON.stringify(payload || {});
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM ciphertext back into an object.
 */
export function decryptSecret(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string') return {};
  const parts = ciphertext.split(':');
  if (parts.length !== 3) return {};
  try {
    const [ivHex, tagHex, dataHex] = parts;
    const decipher = crypto.createDecipheriv(ALGO, getEncryptionKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return {};
  }
}

/**
 * Sanitizes incoming HTML email bodies by stripping scripts, iframes, event handlers,
 * unsafe javascript: URLs, and 1x1 tracking pixels.
 */
export function sanitizeEmailHtml(html = '') {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '$1=$2#$2')
    .replace(/<img[^>]*(?:width\s*=\s*['"]?1['"]?[^>]*height\s*=\s*['"]?1['"]?|display\s*:\s*none)[^>]*>/gi, '')
    .trim();
}

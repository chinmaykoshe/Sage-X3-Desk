import { createWorker } from 'tesseract.js';
import fs from 'fs';

/**
 * Sanitizes OCR or user-supplied text to reduce prompt-injection risk and noisy whitespace.
 */
export function sanitizeExtractedText(raw = '') {
  return String(raw)
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/(ignore\s+(all\s+)?previous\s+instructions|system\s+override|you\s+are\s+now)/gi, '[redacted-instruction]')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 8000);
}

/**
 * Extracts text locally from an uploaded image file using Tesseract.js.
 */
export async function extractTextFromImage(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Image file not found on disk.');
  }

  let worker;
  try {
    worker = await createWorker('eng');
    const { data } = await worker.recognize(filePath);
    const cleaned = sanitizeExtractedText(data?.text || '');
    const confidence = Math.round(data?.confidence || 0);

    return {
      text: cleaned,
      confidence,
      hasUsefulText: cleaned.replace(/[^a-zA-Z0-9]/g, '').length >= 8,
    };
  } finally {
    if (worker) {
      await worker.terminate().catch(() => {});
    }
  }
}

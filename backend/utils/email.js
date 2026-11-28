import nodemailer from 'nodemailer';
import Settings from '../../db/models/Settings.js';
import { decryptSecret } from './secretVault.js';

// ─── Transporter cache ──────────────────────────────────────────────────────
let _transporter = null;
let _cacheBuiltAt = 0;
let _cachedStatus = { configured: false, host: '', user: '', hasPassword: false };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export function invalidateMailerCache() {
  _transporter = null;
  _cacheBuiltAt = 0;
  _cachedStatus = { configured: false, host: '', user: '', hasPassword: false };
}

export function getMailerStatus() {
  return { ..._cachedStatus };
}

async function buildTransporter() {
  // 1. Try DB-stored config first
  try {
    const settings = await Settings.findOne({ key: 'global' }).select('+mailerConfig.encryptedPass').lean();
    const mc = settings?.mailerConfig;
    if (mc?.enabled && mc.host && mc.user && mc.hasPassword) {
      const decrypted = decryptSecret(mc.encryptedPass);
      const pass = decrypted?.password;
      if (pass) {
        const t = nodemailer.createTransport({
          host: mc.host,
          port: mc.port || 587,
          secure: mc.secure || false,
          auth: { user: mc.user, pass },
        });
        _cachedStatus = { configured: true, host: mc.host, user: mc.user, hasPassword: true, from: mc.from };
        return t;
      }
    }
  } catch (e) {
    // DB not ready – fall through to env
  }

  // 2. Fall back to .env SMTP vars
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    _cachedStatus = {
      configured: true,
      host: process.env.SMTP_HOST,
      user: process.env.SMTP_USER,
      hasPassword: !!process.env.SMTP_PASS,
      from: process.env.SMTP_FROM,
    };
    return t;
  }

  _cachedStatus = { configured: false, host: '', user: '', hasPassword: false };
  return null;
}

async function getTransporter() {
  const now = Date.now();
  if (_transporter && now - _cacheBuiltAt < CACHE_TTL_MS) return _transporter;
  _transporter = await buildTransporter();
  _cacheBuiltAt = now;
  return _transporter;
}

function getFrom() {
  return (
    _cachedStatus.from ||
    process.env.SMTP_FROM ||
    'Sage X3 Desk <noreply@sagex3desk.local>'
  );
}

/**
 * Sends an email notification. If SMTP is not configured, gracefully no-ops.
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} [opts.text]
 * @param {string} [opts.html]
 * @param {string} [opts.replyTo]
 */
export async function sendEmailNotification({ to, subject, text, html, replyTo } = {}) {
  if (!to) return { sent: false, reason: 'No recipient' };
  const transport = await getTransporter();
  if (!transport) return { sent: false, reason: 'SMTP not configured' };

  try {
    const mail = { from: getFrom(), to, subject, text, html };
    if (replyTo) mail.replyTo = replyTo;
    const info = await transport.sendMail(mail);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.warn('[mailer] Email delivery error:', err.message);
    return { sent: false, reason: err.message };
  }
}

/**
 * Returns whether SMTP is currently configured (async – checks DB).
 */
export async function isMailerConfigured() {
  await getTransporter(); // populates _cachedStatus
  return _cachedStatus.configured;
}

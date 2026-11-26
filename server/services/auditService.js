import AuditLog from '../models/AuditLog.js';
import SystemLog from '../models/SystemLog.js';
import AIActivityLog from '../models/AIActivityLog.js';
import { isMongoConnected } from '../config/db.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'authorization',
  'cookie',
  'jwt',
  'secret',
  'apikey',
  'api_key',
  'mongo_uri',
  'supabase_secret_key',
  'supabase_service_role_key',
  'privatekey',
]);

export function sanitizeForLog(value, depth = 0) {
  if (value === null || value === undefined || depth > 5) return value;
  if (typeof value === 'string') {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
      .replace(/sb_secret_[A-Za-z0-9_-]+/g, '[REDACTED]')
      .replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, '[REDACTED_MONGO_URI]');
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeForLog(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = sanitizeForLog(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export async function recordAudit({
  actorId = null,
  action,
  recordType,
  recordId = '',
  recordRef = '',
  previousValue = null,
  newValue = null,
  module = 'operations',
  result = 'SUCCESS',
  metadata = {},
}) {
  if (!isMongoConnected()) return null;
  try {
    return await AuditLog.create({
      actorId,
      action,
      recordType,
      recordId: recordId ? String(recordId) : '',
      recordRef,
      previousValue: sanitizeForLog(previousValue),
      newValue: sanitizeForLog(newValue),
      module,
      result,
      metadata: sanitizeForLog(metadata),
      timestamp: new Date(),
    });
  } catch (err) {
    console.warn('AuditLog write warning:', err.message);
    return null;
  }
}

export async function recordSystemLog({
  severity = 'error',
  category = 'application',
  endpoint = '',
  method = '',
  httpStatus = 500,
  durationMs = 0,
  employeeId = null,
  relatedRecord = '',
  module = 'system',
  message = '',
  stackTrace = '',
}) {
  if (!isMongoConnected()) return null;
  try {
    return await SystemLog.create({
      severity,
      category,
      endpoint: sanitizeForLog(endpoint),
      method,
      httpStatus,
      durationMs,
      employeeId,
      relatedRecord: sanitizeForLog(relatedRecord),
      module,
      message: sanitizeForLog(String(message || 'System event')),
      stackTrace: sanitizeForLog(String(stackTrace || '').slice(0, 2500)),
      timestamp: new Date(),
    });
  } catch (err) {
    console.warn('SystemLog write warning:', err.message);
    return null;
  }
}

export async function recordAIActivity(payload) {
  if (!isMongoConnected()) return null;
  try {
    return await AIActivityLog.create({
      ...payload,
      errorMessage: sanitizeForLog(payload.errorMessage || ''),
      timestamp: new Date(),
    });
  } catch (err) {
    console.warn('AIActivityLog write warning:', err.message);
    return null;
  }
}

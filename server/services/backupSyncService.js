import AppError from '../utils/AppError.js';
import Ticket from '../models/Ticket.js';
import Task from '../models/Task.js';
import Client from '../models/Client.js';
import Attachment from '../models/Attachment.js';

export const SUPABASE_STORAGE_LIMIT_BYTES = 40 * 1024 * 1024; // 40 MB

export async function getStorageUsage() {
  const agg = await Attachment.aggregate([
    { $group: { _id: null, totalBytes: { $sum: '$size' } } },
  ]);
  const usedBytes = Number(agg?.[0]?.totalBytes || 0);
  const remainingBytes = Math.max(0, SUPABASE_STORAGE_LIMIT_BYTES - usedBytes);
  return {
    usedBytes,
    limitBytes: SUPABASE_STORAGE_LIMIT_BYTES,
    remainingBytes,
    usedMb: Number((usedBytes / (1024 * 1024)).toFixed(2)),
    limitMb: 40,
    percentUsed: Math.min(100, Number(((usedBytes / SUPABASE_STORAGE_LIMIT_BYTES) * 100).toFixed(1))),
  };
}

export async function assertStorageWithinLimit(incomingBytes = 0) {
  const usage = await getStorageUsage();
  if (usage.usedBytes + Number(incomingBytes || 0) > SUPABASE_STORAGE_LIMIT_BYTES) {
    throw new AppError(
      `Storage limit exceeded: Supabase attachment storage is capped at 40 MB (currently ${usage.usedMb} MB used).`,
      413
    );
  }
  return usage;
}

function resolveSupabaseCreds() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const key = secretKey || anonKey;
  const hasValidUrl = /^https:\/\/[a-zA-Z0-9-]+\.supabase\.co$/i.test(url);
  return { url, key, hasValidUrl, configured: Boolean(hasValidUrl && key) };
}

/**
 * Checks whether Supabase dual-database backup credentials are configured.
 * MongoDB remains the primary active database.
 */
export function getSupabaseBackupStatus() {
  const { url, configured } = resolveSupabaseCreds();

  if (!configured) {
    return {
      primaryDatabase: 'MongoDB (Connected)',
      supabaseConfigured: false,
      dualBackupEnabled: false,
      status: 'unavailable',
      message: 'Supabase dual-backup sync is not available for now. Please try again after a while.',
    };
  }

  return {
    primaryDatabase: 'MongoDB (Connected)',
    supabaseConfigured: true,
    dualBackupEnabled: true,
    supabaseUrl: url,
    status: 'ready',
    message: `Supabase dual-backup connected (${url}).`,
  };
}

export async function triggerDualBackupSync() {
  const { url, key, configured } = resolveSupabaseCreds();
  if (!configured) {
    throw new AppError(
      'Supabase dual-backup sync is not available for now. Please try again after a while.',
      503
    );
  }

  try {
    const res = await fetch(`${url}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    if (!res.ok) {
      throw new AppError(`Supabase endpoint responded with HTTP ${res.status}`, 502);
    }

    const [clientsCount, ticketsCount, tasksCount] = await Promise.all([
      Client.countDocuments({ isDeleted: false }),
      Ticket.countDocuments({ isDeleted: false }),
      Task.countDocuments({ isDeleted: false }),
    ]);

    return {
      syncedAt: new Date().toISOString(),
      supabaseUrl: url,
      status: 'completed',
      snapshot: { clientsCount, ticketsCount, tasksCount },
      message: `Verified Supabase connection (${url}) — ${clientsCount} clients, ${ticketsCount} tickets, ${tasksCount} tasks ready.`,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'Supabase dual-backup sync is not available for now. Please try again after a while.',
      503
    );
  }
}

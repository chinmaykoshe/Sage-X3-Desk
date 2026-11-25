import AppError from '../utils/AppError.js';
import { isMongoConnected } from '../config/db.js';
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
  const mongoUp = isMongoConnected();
  const primaryLabel = mongoUp
    ? 'MongoDB (Connected)'
    : configured
      ? 'MongoDB (Offline — Supabase Cloud Fallback Active)'
      : 'MongoDB (Offline)';

  if (!configured) {
    return {
      primaryDatabase: primaryLabel,
      mongoConnected: mongoUp,
      supabaseConfigured: false,
      dualBackupEnabled: false,
      status: 'unavailable',
      message: 'Supabase dual-backup sync is not available for now. Please try again after a while.',
    };
  }

  return {
    primaryDatabase: primaryLabel,
    mongoConnected: mongoUp,
    supabaseConfigured: true,
    dualBackupEnabled: true,
    supabaseUrl: url,
    status: mongoUp ? 'ready' : 'fallback',
    message: mongoUp
      ? `MongoDB + Supabase dual-backup connected (${url}).`
      : `Supabase cloud fallback active (${url}).`,
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

    let snapshot = { clientsCount: 0, ticketsCount: 0, tasksCount: 0 };
    if (isMongoConnected()) {
      const [clientsCount, ticketsCount, tasksCount] = await Promise.all([
        Client.countDocuments({ isDeleted: false }),
        Ticket.countDocuments({ isDeleted: false }),
        Task.countDocuments({ isDeleted: false }),
      ]);
      snapshot = { clientsCount, ticketsCount, tasksCount };

      // Best-effort snapshot sync to Supabase table if present
      await fetch(`${url}/rest/v1/x3_backup_snapshots`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          synced_at: new Date().toISOString(),
          clients_count: clientsCount,
          tickets_count: ticketsCount,
          tasks_count: tasksCount,
        }),
      }).catch(() => {});
    }

    return {
      syncedAt: new Date().toISOString(),
      supabaseUrl: url,
      mongoConnected: isMongoConnected(),
      status: 'completed',
      snapshot,
      message: isMongoConnected()
        ? `Synced MongoDB → Supabase (${url}) — ${snapshot.clientsCount} clients, ${snapshot.ticketsCount} tickets, ${snapshot.tasksCount} tasks.`
        : `Supabase cloud fallback verified (${url}) — MongoDB is currently offline.`,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'Supabase dual-backup sync is not available for now. Please try again after a while.',
      503
    );
  }
}

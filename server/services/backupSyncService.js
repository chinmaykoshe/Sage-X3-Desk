import mongoose from 'mongoose';
import AppError from '../utils/AppError.js';
import { isMongoConnected } from '../config/db.js';
import Ticket from '../models/Ticket.js';
import Task from '../models/Task.js';
import Client from '../models/Client.js';
import Attachment from '../models/Attachment.js';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Deployment from '../models/Deployment.js';
import Comment from '../models/Comment.js';
import TimeLog from '../models/TimeLog.js';
import Notification from '../models/Notification.js';
import ActivityLog from '../models/ActivityLog.js';
import KnowledgeBase from '../models/KnowledgeBase.js';
import Settings from '../models/Settings.js';
import TicketDraft from '../models/TicketDraft.js';
import AIActionRequest from '../models/AIActionRequest.js';
import SavedView from '../models/SavedView.js';
import Team from '../models/Team.js';

export const SUPABASE_STORAGE_LIMIT_BYTES = 40 * 1024 * 1024; // 40 MB
const SYNC_BUCKET = 'x3desk-sync';
const SNAPSHOT_OBJECT = 'snapshot.json';

let cachedSnapshot = null;
let cachedSnapshotAt = 0;
let syncTimer = null;

export function resolveSupabaseCreds() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const key = secretKey || anonKey;
  const hasValidUrl = /^https:\/\/[a-zA-Z0-9-]+\.supabase\.co$/i.test(url);
  return { url, key, hasValidUrl, configured: Boolean(hasValidUrl && key) };
}

function supaHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}

async function ensureSyncBucket(url, key, bucketId = SYNC_BUCKET, isPublic = false) {
  await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: supaHeaders(key, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: bucketId, name: bucketId, public: isPublic }),
  }).catch(() => {});
}

async function getBucketBytes(url, key, bucketId) {
  try {
    const res = await fetch(`${url}/storage/v1/object/list/${bucketId}`, {
      method: 'POST',
      headers: supaHeaders(key, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix: '', limit: 1000 }),
    });
    if (!res.ok) return 0;
    const items = await res.json();
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum, it) => sum + Number(it?.metadata?.size || 0), 0);
  } catch {
    return 0;
  }
}

export async function getStorageUsage() {
  let mongoAttachmentBytes = 0;
  if (isMongoConnected()) {
    const agg = await Attachment.aggregate([
      { $group: { _id: null, totalBytes: { $sum: '$size' } } },
    ]);
    mongoAttachmentBytes = Number(agg?.[0]?.totalBytes || 0);
  }

  let supabaseBucketBytes = 0;
  const { url, key, configured } = resolveSupabaseCreds();
  if (configured) {
    const [imagesBytes, syncBytes] = await Promise.all([
      getBucketBytes(url, key, 'images'),
      getBucketBytes(url, key, SYNC_BUCKET),
    ]);
    supabaseBucketBytes = imagesBytes + syncBytes;
  }

  const usedBytes = Math.max(mongoAttachmentBytes, supabaseBucketBytes);
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
      `Storage limit exceeded: Supabase storage cannot exceed 40 MB (currently ${usage.usedMb} MB used).`,
      413
    );
  }
  return usage;
}

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
      ? `MongoDB + Supabase dual-sync connected (${url}).`
      : `Supabase cloud fallback active (${url}).`,
  };
}

export async function saveSupabaseSnapshot(snapshot) {
  const { url, key, configured } = resolveSupabaseCreds();
  if (!configured) {
    throw new AppError('Supabase dual-backup sync is not available for now. Please try again after a while.', 503);
  }

  const imagesBytes = await getBucketBytes(url, key, 'images');
  let jsonBody = JSON.stringify(snapshot);
  let byteSize = Buffer.byteLength(jsonBody, 'utf8');

  // If total Supabase usage (images + snapshot) would exceed 40 MB, trim non-critical logs first
  if (imagesBytes + byteSize > SUPABASE_STORAGE_LIMIT_BYTES && snapshot?.collections) {
    snapshot.collections.activityLogs = (snapshot.collections.activityLogs || []).slice(0, 25);
    snapshot.collections.notifications = (snapshot.collections.notifications || []).slice(0, 25);
    jsonBody = JSON.stringify(snapshot);
    byteSize = Buffer.byteLength(jsonBody, 'utf8');
  }

  if (imagesBytes + byteSize > SUPABASE_STORAGE_LIMIT_BYTES) {
    const totalMb = ((imagesBytes + byteSize) / (1024 * 1024)).toFixed(2);
    throw new AppError(
      `Storage limit exceeded: Supabase storage cannot exceed 40 MB (images + snapshot = ${totalMb} MB).`,
      413
    );
  }

  await ensureSyncBucket(url, key, SYNC_BUCKET, false);
  const res = await fetch(`${url}/storage/v1/object/${SYNC_BUCKET}/${SNAPSHOT_OBJECT}`, {
    method: 'POST',
    headers: supaHeaders(key, {
      'Content-Type': 'application/json',
      'x-upsert': 'true',
    }),
    body: jsonBody,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new AppError(`Failed to sync snapshot to Supabase (${res.status}): ${errText}`, 502);
  }

  cachedSnapshot = snapshot;
  cachedSnapshotAt = Date.now();
  return { byteSize };
}

export async function loadSupabaseSnapshot(forceRefresh = false) {
  if (!forceRefresh && cachedSnapshot && Date.now() - cachedSnapshotAt < 10000) {
    return cachedSnapshot;
  }
  const { url, key, configured } = resolveSupabaseCreds();
  if (!configured) return null;

  try {
    const res = await fetch(`${url}/storage/v1/object/${SYNC_BUCKET}/${SNAPSHOT_OBJECT}`, {
      method: 'GET',
      headers: supaHeaders(key),
    });
    if (!res.ok) {
      return {
        syncedAt: new Date().toISOString(),
        source: 'empty',
        collections: {},
      };
    }
    const parsed = await res.json();
    cachedSnapshot = parsed;
    cachedSnapshotAt = Date.now();
    return parsed;
  } catch {
    return cachedSnapshot || { syncedAt: new Date().toISOString(), source: 'empty', collections: {} };
  }
}

export async function uploadFileToSupabase(fileBuffer, fileName, mimeType = 'application/octet-stream') {
  const { url, key, configured } = resolveSupabaseCreds();
  if (!configured) {
    throw new AppError('Supabase storage is not configured.', 503);
  }
  await assertStorageWithinLimit(fileBuffer.length);
  const safeName = `${Date.now()}-${String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const res = await fetch(`${url}/storage/v1/object/images/x3desk/${safeName}`, {
    method: 'POST',
    headers: supaHeaders(key, {
      'Content-Type': mimeType,
      'x-upsert': 'true',
    }),
    body: fileBuffer,
  });
  if (!res.ok) {
    throw new AppError(`Supabase upload failed (${res.status})`, 502);
  }
  return {
    filename: safeName,
    url: `${url}/storage/v1/object/public/images/x3desk/${safeName}`,
    size: fileBuffer.length,
  };
}

const SYNC_COLLECTIONS = [
  { key: 'users', model: User, uniqueField: 'email' },
  { key: 'clients', model: Client, uniqueField: 'clientId' },
  { key: 'tickets', model: Ticket, uniqueField: 'ticketId' },
  { key: 'ticketDrafts', model: TicketDraft, uniqueField: 'draftId' },
  { key: 'tasks', model: Task, uniqueField: 'taskId' },
  { key: 'projects', model: Project, uniqueField: 'projectId' },
  { key: 'deployments', model: Deployment, uniqueField: 'deploymentId' },
  { key: 'comments', model: Comment },
  { key: 'attachments', model: Attachment },
  { key: 'timeLogs', model: TimeLog },
  { key: 'knowledgeBase', model: KnowledgeBase },
  { key: 'aiActionRequests', model: AIActionRequest },
  { key: 'savedViews', model: SavedView },
  { key: 'teams', model: Team },
  { key: 'settings', model: Settings, uniqueField: 'key' },
  { key: 'notifications', model: Notification },
  { key: 'activityLogs', model: ActivityLog },
];

/**
 * Pulls any missing or newer records from Supabase cloud snapshot into local MongoDB
 * so cloud-created tickets/drafts are preserved before pushing the unified snapshot.
 */
export async function mergeSupabaseToMongo() {
  const { configured } = resolveSupabaseCreds();
  if (!configured || !isMongoConnected()) return { pulled: 0, updated: 0 };

  const cloudSnap = await loadSupabaseSnapshot(true);
  const cols = cloudSnap?.collections;
  if (!cols || typeof cols !== 'object') return { pulled: 0, updated: 0 };

  let pulled = 0;
  let updated = 0;

  for (const { key, model, uniqueField } of SYNC_COLLECTIONS) {
    const cloudDocs = Array.isArray(cols[key]) ? cols[key] : [];
    for (const rawDoc of cloudDocs) {
      if (!rawDoc || !rawDoc._id || !mongoose.Types.ObjectId.isValid(String(rawDoc._id))) continue;

      const oid = new mongoose.Types.ObjectId(String(rawDoc._id));
      const { _id, __v, ...rest } = rawDoc;
      const query = uniqueField && rawDoc[uniqueField]
        ? { $or: [{ _id: oid }, { [uniqueField]: rawDoc[uniqueField] }] }
        : { _id: oid };

      const existing = await model.collection.findOne(query, { projection: { _id: 1, updatedAt: 1, createdAt: 1 } });
      try {
        if (!existing) {
          await model.findOneAndUpdate(
            { _id: oid },
            { $setOnInsert: rest },
            { upsert: true, setDefaultsOnInsert: true }
          );
          pulled += 1;
        } else {
          const cloudTs = new Date(rawDoc.updatedAt || rawDoc.createdAt || 0).getTime();
          const localTs = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
          if (cloudTs > localTs + 1000) {
            await model.findOneAndUpdate({ _id: existing._id }, { $set: rest });
            updated += 1;
          }
        }
      } catch (docErr) {
        console.warn(`Sync merge skipped ${key} (${rawDoc._id}):`, docErr.message);
      }
    }
  }

  return { pulled, updated };
}

export async function syncMongoToSupabase() {
  const { url, key, configured } = resolveSupabaseCreds();
  if (!configured || !isMongoConnected()) return null;

  const mergeStats = await mergeSupabaseToMongo().catch((err) => {
    console.warn('Cloud->Local merge warning:', err.message);
    return { pulled: 0, updated: 0 };
  });

  const [
    users,
    clients,
    tickets,
    tasks,
    projects,
    deployments,
    comments,
    attachments,
    timeLogs,
    notifications,
    activityLogs,
    knowledgeBase,
    settings,
    ticketDrafts,
    aiActionRequests,
    savedViews,
    teams,
  ] = await Promise.all([
    User.find({}).select('+password').lean(),
    Client.find({}).lean(),
    Ticket.find({}).lean(),
    Task.find({}).lean(),
    Project.find({}).lean(),
    Deployment.find({}).lean(),
    Comment.find({}).lean(),
    Attachment.find({}).lean(),
    TimeLog.find({}).lean(),
    Notification.find({}).sort({ createdAt: -1 }).limit(100).lean(),
    ActivityLog.find({}).sort({ createdAt: -1 }).limit(150).lean(),
    KnowledgeBase.find({}).lean(),
    Settings.find({}).lean(),
    TicketDraft.find({}).lean(),
    AIActionRequest.find({}).lean(),
    SavedView.find({}).lean(),
    Team.find({}).lean(),
  ]);

  const snapshot = {
    syncedAt: new Date().toISOString(),
    source: 'mongodb',
    collections: {
      users,
      clients,
      tickets,
      tasks,
      projects,
      deployments,
      comments,
      attachments,
      timeLogs,
      notifications,
      activityLogs,
      knowledgeBase,
      settings,
      ticketDrafts,
      aiActionRequests,
      savedViews,
      teams,
    },
  };

  const saved = await saveSupabaseSnapshot(snapshot);
  return {
    syncedAt: snapshot.syncedAt,
    supabaseUrl: url,
    snapshotBytes: saved.byteSize,
    mergeStats,
    snapshot: {
      usersCount: users.length,
      clientsCount: clients.length,
      ticketsCount: tickets.length,
      tasksCount: tasks.length,
      ticketDraftsCount: ticketDrafts.length,
    },
  };
}

export function scheduleSupabaseSync(delayMs = 1500) {
  const { configured } = resolveSupabaseCreds();
  if (!configured || !isMongoConnected()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncMongoToSupabase().catch((err) => {
      console.warn('Background Mongo->Supabase sync warning:', err.message);
    });
  }, delayMs);
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
      headers: supaHeaders(key),
    });
    if (!res.ok) {
      throw new AppError(`Supabase endpoint responded with HTTP ${res.status}`, 502);
    }

    if (isMongoConnected()) {
      const synced = await syncMongoToSupabase();
      const storage = await getStorageUsage();
      return {
        syncedAt: synced.syncedAt,
        supabaseUrl: url,
        mongoConnected: true,
        status: 'completed',
        storage,
        mergeStats: synced.mergeStats,
        snapshot: synced.snapshot,
        message: `Synced MongoDB ↔ Supabase (${url}) — ${synced.snapshot.clientsCount} clients, ${synced.snapshot.ticketsCount} tickets, ${synced.snapshot.ticketDraftsCount} drafts, ${synced.snapshot.tasksCount} tasks (${storage.usedMb} / ${storage.limitMb} MB used).`,
      };
    }

    const existingSnap = await loadSupabaseSnapshot(true);
    const storage = await getStorageUsage();
    return {
      syncedAt: existingSnap?.syncedAt || new Date().toISOString(),
      supabaseUrl: url,
      mongoConnected: false,
      status: 'fallback',
      storage,
      snapshot: {
        clientsCount: existingSnap?.collections?.clients?.length || 0,
        ticketsCount: existingSnap?.collections?.tickets?.length || 0,
        tasksCount: existingSnap?.collections?.tasks?.length || 0,
      },
      message: `Supabase cloud fallback active (${url}) — serving synced cloud snapshot.`,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'Supabase dual-backup sync is not available for now. Please try again after a while.',
      503
    );
  }
}

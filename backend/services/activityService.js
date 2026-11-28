import ActivityLog from '../../db/models/ActivityLog.js';

export async function recordActivity({
  actor,
  action,
  entityType,
  entityId,
  entityRef = '',
  client = null,
  ticket = null,
  summary,
  metadata = {},
}) {
  if (!actor || !entityId) return null;
  return ActivityLog.create({
    actor,
    action,
    entityType,
    entityId,
    entityRef,
    client,
    ticket,
    summary,
    metadata,
  });
}

import Settings from '../models/Settings.js';
import Team from '../models/Team.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { recordActivity } from '../services/activityService.js';
import { getSupabaseBackupStatus, triggerDualBackupSync } from '../services/backupSyncService.js';

export const getSettings = asyncHandler(async (req, res) => {
  let settings = await Settings.findOne({ key: 'global' }).lean();
  if (!settings) {
    settings = await Settings.create({ key: 'global' });
  }
  const teams = await Team.find({ isDeleted: false })
    .populate('lead', 'fullName')
    .populate('members', 'fullName designation')
    .lean();
  const backupStatus = getSupabaseBackupStatus();
  return sendSuccess(res, { settings, teams, backupStatus }, 'Settings retrieved');
});

export const getBackupStatus = asyncHandler(async (req, res) => {
  return sendSuccess(res, getSupabaseBackupStatus(), 'Backup status retrieved');
});

export const syncDualBackup = asyncHandler(async (req, res) => {
  const result = await triggerDualBackupSync();
  return sendSuccess(res, result, result.message);
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.findOneAndUpdate(
    { key: 'global' },
    { ...req.body, updatedBy: req.user._id },
    { new: true, upsert: true }
  );

  await recordActivity({
    actor: req.user._id,
    action: 'SETTINGS_UPDATED',
    entityType: 'settings',
    entityId: settings._id,
    summary: 'Updated application operational settings and SLA defaults',
  });

  return sendSuccess(res, settings, 'Settings updated');
});

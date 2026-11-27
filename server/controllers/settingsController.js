import Settings from '../models/Settings.js';
import Team from '../models/Team.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { recordActivity } from '../services/activityService.js';

export const getSettings = asyncHandler(async (req, res) => {
  let settings = await Settings.findOne({ key: 'global' }).lean();
  if (!settings) {
    settings = await Settings.create({ key: 'global' });
  }
  const teams = await Team.find({ isDeleted: false })
    .populate('lead', 'fullName')
    .populate('members', 'fullName designation')
    .lean();
  return sendSuccess(res, { settings, teams }, 'Settings retrieved');
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

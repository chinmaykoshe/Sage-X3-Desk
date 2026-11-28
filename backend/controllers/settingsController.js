import Settings from '../../db/models/Settings.js';
import Team from '../../db/models/Team.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { recordActivity } from '../services/activityService.js';
import { encryptSecret } from '../utils/secretVault.js';
import { invalidateMailerCache, getMailerStatus, sendEmailNotification } from '../utils/email.js';

export const getSettings = asyncHandler(async (req, res) => {
  let settings = await Settings.findOne({ key: 'global' }).lean();
  if (!settings) {
    settings = await Settings.create({ key: 'global' });
  }
  const teams = await Team.find({ isDeleted: false })
    .populate('lead', 'fullName')
    .populate('members', 'fullName designation')
    .lean();

  // Strip encryptedPass, expose only hasPassword
  if (settings.mailerConfig) {
    delete settings.mailerConfig.encryptedPass;
  }

  return sendSuccess(res, { settings, teams }, 'Settings retrieved');
});

export const updateSettings = asyncHandler(async (req, res) => {
  const body = { ...req.body, updatedBy: req.user._id };

  // Handle mailerConfig password encryption
  if (body.mailerConfig) {
    const mc = body.mailerConfig;
    const rawPassword = mc.password;
    delete mc.password; // never store raw

    if (rawPassword && rawPassword.trim()) {
      mc.encryptedPass = encryptSecret({ password: rawPassword });
      mc.hasPassword = true;
    } else {
      // No new password supplied → preserve existing encryptedPass
      delete mc.encryptedPass;
      delete mc.hasPassword;
    }
    body.mailerConfig = mc;
  }

  const settings = await Settings.findOneAndUpdate(
    { key: 'global' },
    { $set: body },
    { new: true, upsert: true }
  );

  // Invalidate mailer transporter cache so next email picks up new config
  if (req.body.mailerConfig) {
    invalidateMailerCache();
  }

  await recordActivity({
    actor: req.user._id,
    action: 'SETTINGS_UPDATED',
    entityType: 'settings',
    entityId: settings._id,
    summary: 'Updated application operational settings and SLA defaults',
  });

  // Strip encryptedPass from response
  const out = settings.toObject();
  if (out.mailerConfig) delete out.mailerConfig.encryptedPass;

  return sendSuccess(res, out, 'Settings updated');
});

export const testMailer = asyncHandler(async (req, res) => {
  const status = getMailerStatus();
  if (!status.configured) {
    // Force a fresh check
    await sendEmailNotification({ to: 'probe@example.com', subject: 'probe' });
    const updated = getMailerStatus();
    if (!updated.configured) {
      return sendSuccess(res, { sent: false, reason: 'SMTP not configured' }, 'Test failed');
    }
  }

  const result = await sendEmailNotification({
    to: req.user.email,
    subject: 'Sage X3 Desk — SMTP Test',
    html: `<p>Hi <strong>${req.user.fullName}</strong>,</p><p>Your SMTP configuration is working correctly! 🎉</p><p><small>Sent from Sage X3 Desk at ${new Date().toISOString()}</small></p>`,
    text: `Hi ${req.user.fullName}, your SMTP configuration is working correctly!`,
  });

  return sendSuccess(res, result, result.sent ? 'Test email sent' : 'Test failed');
});

import User from '../../db/models/User.js';
import PasswordResetRequest from '../../db/models/PasswordResetRequest.js';
import SignupVerification from '../../db/models/SignupVerification.js';
import { getNextSequence } from '../../db/models/Counter.js';
import { ROLES } from '../config/constants.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { signToken } from '../middleware/auth.js';
import { recordActivity } from '../services/activityService.js';
import { getEffectivePermissions } from '../services/rbacService.js';
import { recordAudit, recordSystemLog } from '../services/auditService.js';
import { sendEmailNotification, isMailerConfigured } from '../utils/email.js';
import crypto from 'crypto';

// ─── Helpers ────────────────────────────────────────────────────────────────
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function generate4DigitCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getClientOrigin(req) {
  const origin = req.get('origin');
  if (origin) return origin.replace(/\/+$/, '');
  const referer = req.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // ignore invalid referer
    }
  }
  return process.env.CLIENT_URL?.split(',')[0]?.trim() || 'http://localhost:5174';
}

function passwordResetEmailHtml({ fullName, resetUrl, code, expiresInMinutes = 60 }) {
  return `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f4f6fb;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <div style="background:linear-gradient(135deg,#4f46e5,#638BEF);padding:32px 36px;">
      <h1 style="color:#fff;margin:0;font-size:22px;">Sage X3 Desk</h1>
      <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:14px;">Password Reset Request</p>
    </div>
    <div style="padding:32px 36px;">
      <p style="color:#374151;font-size:15px;">Hi <strong>${fullName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;line-height:1.6;">An admin has approved your password reset. Use the button and verification code below to set a new password. This link expires in <strong>${expiresInMinutes} minutes</strong>.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">Reset My Password</a>
      </div>
      <div style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:8px;padding:16px;text-align:center;margin:20px 0;">
        <p style="color:#6b7280;font-size:12px;margin:0 0 8px;">Your 4-digit verification code</p>
        <p style="color:#4f46e5;font-size:32px;font-weight:700;letter-spacing:12px;margin:0;">${code}</p>
      </div>
      <p style="color:#9ca3af;font-size:12px;line-height:1.6;">If you didn't request a password reset, please ignore this email. Your account remains secure.</p>
    </div>
  </div>
</body>
</html>`;
}

function verifyEmailHtml({ fullName, code }) {
  return `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f4f6fb;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <div style="background:linear-gradient(135deg,#4f46e5,#638BEF);padding:32px 36px;">
      <h1 style="color:#fff;margin:0;font-size:22px;">Sage X3 Desk</h1>
      <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:14px;">Verify Your Email</p>
    </div>
    <div style="padding:32px 36px;">
      <p style="color:#374151;font-size:15px;">Hi <strong>${fullName || 'there'}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;line-height:1.6;">Welcome to Sage X3 Desk! Enter the 4-digit code below to verify your email address and activate your account.</p>
      <div style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:8px;padding:16px;text-align:center;margin:28px 0;">
        <p style="color:#6b7280;font-size:12px;margin:0 0 8px;">Your verification code (expires in 15 minutes)</p>
        <p style="color:#4f46e5;font-size:32px;font-weight:700;letter-spacing:12px;margin:0;">${code}</p>
      </div>
      <p style="color:#9ca3af;font-size:12px;">If you didn't create an account, please ignore this email.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Existing: login ─────────────────────────────────────────────────────────
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.validatedBody;
  const user = await User.findOne({ email: email.toLowerCase(), isDeleted: false }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    await recordSystemLog({
      severity: 'security',
      category: 'auth_failure',
      endpoint: '/api/auth/login',
      method: 'POST',
      httpStatus: 401,
      module: 'auth',
      message: `Failed login attempt for ${email.toLowerCase()}`,
    });
    await recordAudit({
      actorId: user?._id || null,
      action: 'LOGIN_FAILED',
      recordType: 'User',
      recordRef: email.toLowerCase(),
      module: 'auth',
      result: 'FAILED',
    });
    throw new AppError('Invalid email or password.', 401);
  }

  // Block pending (unverified) users
  if (user.status === 'Pending') {
    throw new AppError('Please verify your email first. Check your inbox for the 4-digit verification code.', 403);
  }
  if (user.status === 'Inactive') {
    throw new AppError('Your account is inactive. Please contact an administrator.', 403);
  }

  const token = signToken(user._id);
  const safeUser = user.toJSON();
  safeUser.effectivePermissions = await getEffectivePermissions(user);

  await recordAudit({
    actorId: user._id,
    action: 'USER_LOGIN',
    recordType: 'User',
    recordId: user._id,
    recordRef: user.employeeId || user.email,
    module: 'auth',
    result: 'SUCCESS',
  });

  return sendSuccess(res, { token, user: safeUser }, 'Logged in successfully');
});

// ─── Existing: register ───────────────────────────────────────────────────────
export const register = asyncHandler(async (req, res) => {
  const { fullName, email, password, contactNumber, designation, department } = req.validatedBody;
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new AppError('An account with this email already exists.', 409);
  }

  const mailerReady = await isMailerConfigured();
  const employeeId = await getNextSequence('employee', 'EMP', 101);

  const user = await User.create({
    employeeId,
    fullName,
    email: email.toLowerCase(),
    password,
    contactNumber,
    designation,
    department,
    role: ROLES.DEVELOPER,
    status: mailerReady ? 'Pending' : 'Active',
    emailVerified: !mailerReady,
  });

  await recordActivity({
    actor: user._id,
    action: 'USER_REGISTERED',
    entityType: 'user',
    entityId: user._id,
    entityRef: user.employeeId,
    summary: `${user.fullName} registered as ${user.designation}`,
  });

  if (mailerReady) {
    // Send verification code
    const code = generate4DigitCode();
    await SignupVerification.findOneAndDelete({ email: email.toLowerCase() });
    await SignupVerification.create({
      email: email.toLowerCase(),
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    await sendEmailNotification({
      to: email.toLowerCase(),
      subject: 'Verify your Sage X3 Desk account',
      html: verifyEmailHtml({ fullName, code }),
      text: `Your Sage X3 Desk verification code is: ${code}. It expires in 15 minutes.`,
    });
    return sendSuccess(
      res,
      { pending: true, email: user.email, message: 'Check your email for a 4-digit verification code.' },
      'Registration started — please verify your email',
      201
    );
  }

  const token = signToken(user._id);
  return sendSuccess(res, { token, user }, 'Account registered successfully', 201);
});

// ─── Existing: getMe / updateProfile / logout ─────────────────────────────────
export const getMe = asyncHandler(async (req, res) => {
  const safeUser = req.user.toJSON ? req.user.toJSON() : { ...req.user };
  safeUser.effectivePermissions = req.effectivePermissions || (await getEffectivePermissions(req.user));
  return sendSuccess(res, safeUser, 'Current user fetched');
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, contactNumber, designation, skills, preferences } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) throw new AppError('User not found', 404);

  if (fullName) user.fullName = fullName;
  if (contactNumber !== undefined) user.contactNumber = contactNumber;
  if (designation) user.designation = designation;
  if (Array.isArray(skills)) user.skills = skills;
  if (preferences) {
    user.preferences = { ...user.preferences.toObject?.(), ...preferences };
  }

  await user.save();
  return sendSuccess(res, user, 'Profile updated successfully');
});

export const logout = asyncHandler(async (req, res) => {
  return sendSuccess(res, null, 'Logged out successfully');
});

// ─── NEW: Email verification ──────────────────────────────────────────────────
export const verifyEmail = asyncHandler(async (req, res) => {
  const { email, code } = req.validatedBody;
  const record = await SignupVerification.findOne({ email: email.toLowerCase() });
  if (!record) throw new AppError('No pending verification for this email.', 404);
  if (record.expiresAt < new Date()) {
    await SignupVerification.deleteOne({ _id: record._id });
    throw new AppError('Verification code has expired. Please request a new one.', 410);
  }
  if (record.attempts >= 5) throw new AppError('Too many attempts. Please request a new code.', 429);

  if (record.codeHash !== sha256(code)) {
    record.attempts += 1;
    await record.save();
    throw new AppError(`Invalid code. ${5 - record.attempts} attempts remaining.`, 400);
  }

  // Activate user
  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { status: 'Active', emailVerified: true },
    { new: true }
  );
  if (!user) throw new AppError('User not found.', 404);

  await SignupVerification.deleteOne({ _id: record._id });

  const token = signToken(user._id);
  const safeUser = user.toJSON();
  safeUser.effectivePermissions = await getEffectivePermissions(user);

  return sendSuccess(res, { token, user: safeUser }, 'Email verified — welcome to Sage X3 Desk!');
});

export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.validatedBody;
  const user = await User.findOne({ email: email.toLowerCase(), isDeleted: false });
  if (!user) throw new AppError('No account found with this email.', 404);
  if (user.status !== 'Pending') return sendSuccess(res, {}, 'Account already verified.');

  const code = generate4DigitCode();
  await SignupVerification.findOneAndDelete({ email: email.toLowerCase() });
  await SignupVerification.create({
    email: email.toLowerCase(),
    codeHash: sha256(code),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });
  await sendEmailNotification({
    to: email.toLowerCase(),
    subject: 'Your new Sage X3 Desk verification code',
    html: verifyEmailHtml({ fullName: user.fullName, code }),
    text: `Your new verification code is: ${code}. Expires in 15 minutes.`,
  });
  return sendSuccess(res, {}, 'Verification code resent. Check your inbox.');
});

// ─── NEW: Forgot password (user-initiated) ────────────────────────────────────
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email, reason } = req.validatedBody;
  // Always return 200 to prevent user enumeration
  const user = await User.findOne({ email: email.toLowerCase(), isDeleted: false });
  if (user && user.status !== 'Inactive') {
    await PasswordResetRequest.create({
      user: user._id,
      email: email.toLowerCase(),
      reason: reason || 'User forgot password',
      status: 'PENDING_ADMIN',
    });
    // Notify all admins (in-app notification via activity — email optional)
    const admins = await User.find({ role: ROLES.ADMIN, status: 'Active', isDeleted: false }).select('email fullName');
    for (const admin of admins) {
      await sendEmailNotification({
        to: admin.email,
        subject: `[Action Required] Password reset request from ${user.fullName}`,
        html: `<p>Hi ${admin.fullName},</p><p><strong>${user.fullName}</strong> (${user.email}) has requested a password reset. Please log in to Sage X3 Desk Admin → Password Resets to review and send them a reset link.</p>`,
        text: `${user.fullName} (${user.email}) requested a password reset. Please review in Admin > Password Resets.`,
      }).catch(() => {});
    }
  }
  return sendSuccess(res, {}, 'If an account with that email exists, an admin has been notified. You will receive a reset link by email shortly.');
});

// ─── NEW: Admin — list reset requests ────────────────────────────────────────
export const adminListResetRequests = asyncHandler(async (req, res) => {
  const requests = await PasswordResetRequest.find()
    .populate('user', 'fullName email employeeId role designation')
    .populate('handledBy', 'fullName')
    .sort({ createdAt: -1 })
    .lean();
  return sendSuccess(res, requests, 'Reset requests retrieved');
});

// ─── NEW: Admin — send reset link ─────────────────────────────────────────────
export const adminSendReset = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const request = await PasswordResetRequest.findById(requestId).populate('user', 'fullName email');
  if (!request) throw new AppError('Reset request not found.', 404);
  if (!['PENDING_ADMIN', 'LINK_SENT'].includes(request.status)) {
    throw new AppError(`Cannot send link for a request in status: ${request.status}`, 400);
  }

  const token = generateResetToken();
  const code = generate4DigitCode();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  request.resetTokenHash = sha256(token);
  request.verificationCodeHash = sha256(code);
  request.expiresAt = expiresAt;
  request.status = 'LINK_SENT';
  request.handledBy = req.user._id;
  request.sentAt = new Date();
  await request.save();

  const clientUrl = getClientOrigin(req);
  const resetUrl = `${clientUrl}/reset-password?token=${token}`;

  const emailResult = await sendEmailNotification({
    to: request.user.email,
    subject: 'Reset your Sage X3 Desk password',
    html: passwordResetEmailHtml({
      fullName: request.user.fullName,
      resetUrl,
      code,
      expiresInMinutes: 60,
    }),
    text: `Reset your password at: ${resetUrl}\n\nYour verification code: ${code}\n\nThis link expires in 60 minutes.`,
  });

  request.mailDelivery = emailResult;
  await request.save();

  return sendSuccess(res, { sent: true, emailResult }, 'Reset link sent to user');
});

// ─── NEW: Admin — send reset link directly for any user (from Team page) ──────
export const adminSendResetForUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await User.findOne({ _id: userId, isDeleted: false }).select('fullName email status');
  if (!user) throw new AppError('User not found.', 404);

  const token = generateResetToken();
  const code = generate4DigitCode();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  const request = await PasswordResetRequest.create({
    user: user._id,
    email: user.email,
    reason: 'Initiated by Admin from Team Members',
    status: 'LINK_SENT',
    resetTokenHash: sha256(token),
    verificationCodeHash: sha256(code),
    expiresAt,
    handledBy: req.user._id,
    sentAt: new Date(),
  });

  const clientUrl = getClientOrigin(req);
  const resetUrl = `${clientUrl}/reset-password?token=${token}`;

  const emailResult = await sendEmailNotification({
    to: user.email,
    subject: 'Reset your Sage X3 Desk password',
    html: passwordResetEmailHtml({
      fullName: user.fullName,
      resetUrl,
      code,
      expiresInMinutes: 60,
    }),
    text: `Reset your password at: ${resetUrl}\n\nYour verification code: ${code}\n\nThis link expires in 60 minutes.`,
  });

  request.mailDelivery = emailResult;
  await request.save();

  return sendSuccess(res, { sent: emailResult.sent, emailResult, email: user.email }, 'Password reset mail processed');
});

// ─── NEW: Admin — reject reset request ───────────────────────────────────────
export const adminRejectReset = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const { adminNote } = req.body;
  const request = await PasswordResetRequest.findById(requestId);
  if (!request) throw new AppError('Reset request not found.', 404);

  request.status = 'REJECTED';
  request.handledBy = req.user._id;
  request.adminNote = adminNote || '';
  await request.save();

  return sendSuccess(res, {}, 'Reset request rejected');
});

// ─── NEW: Reset password (token + code) ──────────────────────────────────────
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, code, newPassword } = req.validatedBody;

  const tokenHash = sha256(token);
  const request = await PasswordResetRequest.findOne({
    resetTokenHash: tokenHash,
    status: 'LINK_SENT',
    expiresAt: { $gt: new Date() },
  }).populate('user');

  if (!request) throw new AppError('Invalid or expired reset link. Please request a new one.', 400);
  if ((request.attempts || 0) >= 5) throw new AppError('Too many attempts. Please request a new reset link.', 429);

  if (request.verificationCodeHash !== sha256(code)) {
    request.attempts = (request.attempts || 0) + 1;
    await request.save();
    throw new AppError(`Invalid verification code. ${5 - request.attempts} attempts remaining.`, 400);
  }

  // Set new password
  const user = await User.findById(request.user._id).select('+password');
  if (!user) throw new AppError('User not found.', 404);
  user.password = newPassword;
  await user.save();

  // Mark completed
  request.status = 'COMPLETED';
  request.completedAt = new Date();
  await request.save();

  const token2 = signToken(user._id);
  const safeUser = user.toJSON();
  safeUser.effectivePermissions = await getEffectivePermissions(user);

  return sendSuccess(res, { token: token2, user: safeUser }, 'Password reset successfully. You are now logged in.');
});

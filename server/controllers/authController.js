import User from '../models/User.js';
import { getNextSequence } from '../models/Counter.js';
import { ROLES } from '../config/constants.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { signToken } from '../middleware/auth.js';
import { recordActivity } from '../services/activityService.js';
import { getEffectivePermissions } from '../services/rbacService.js';
import { recordAudit, recordSystemLog } from '../services/auditService.js';

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

export const register = asyncHandler(async (req, res) => {
  const { fullName, email, password, contactNumber, designation, department } = req.validatedBody;
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new AppError('An account with this email already exists.', 409);
  }

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
  });

  await recordActivity({
    actor: user._id,
    action: 'USER_REGISTERED',
    entityType: 'user',
    entityId: user._id,
    entityRef: user.employeeId,
    summary: `${user.fullName} registered as ${user.designation}`,
  });

  const token = signToken(user._id);
  return sendSuccess(res, { token, user }, 'Account registered successfully', 201);
});

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

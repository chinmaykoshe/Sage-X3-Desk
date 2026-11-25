import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ROLES } from '../config/constants.js';

export const protect = asyncHandler(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    throw new AppError('Authentication required. Please log in.', 401);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new AppError('Invalid or expired session token.', 401);
  }

  const user = await User.findOne({ _id: decoded.id, isDeleted: false }).populate('team', 'name');
  if (!user) {
    throw new AppError('User account no longer exists.', 401);
  }
  if (user.status === 'Inactive') {
    throw new AppError('User account is inactive. Contact an administrator.', 403);
  }

  req.user = user;
  next();
});

export const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    throw new AppError('You do not have permission to perform this action.', 403);
  }
  next();
};

/**
 * Checks either role membership or an explicit granular permission flag on the user.
 */
export const authorizePermission = (permissionKey, fallbackRoles = [ROLES.ADMIN, ROLES.TEAM_LEAD]) => (req, res, next) => {
  if (!req.user) {
    throw new AppError('Authentication required.', 401);
  }
  if (req.user.role === ROLES.ADMIN) return next();
  if (fallbackRoles.includes(req.user.role)) return next();
  if (req.user.permissions?.[permissionKey]) return next();
  throw new AppError('Insufficient permissions for this operation.', 403);
};

export const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

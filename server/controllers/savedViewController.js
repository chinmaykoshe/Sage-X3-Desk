import SavedView from '../models/SavedView.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { ROLES } from '../config/constants.js';

export const getSavedViews = asyncHandler(async (req, res) => {
  const { entityType } = req.query;
  const filter = {
    isDeleted: false,
    $or: [{ owner: req.user._id }, { isShared: true }],
  };
  if (entityType) filter.entityType = entityType;

  const views = await SavedView.find(filter)
    .populate('owner', 'fullName')
    .sort({ isPinned: -1, isDefault: -1, createdAt: 1 })
    .lean();

  return sendSuccess(res, views, 'Saved views retrieved');
});

export const createSavedView = asyncHandler(async (req, res) => {
  const payload = req.validatedBody;
  if (payload.isShared && ![ROLES.ADMIN, ROLES.TEAM_LEAD].includes(req.user.role)) {
    throw new AppError('Only Team Leads or Administrators can create shared team views.', 403);
  }

  if (payload.isDefault) {
    await SavedView.updateMany(
      { owner: req.user._id, entityType: payload.entityType, isDeleted: false },
      { isDefault: false }
    );
  }

  const view = await SavedView.create({
    ...payload,
    owner: req.user._id,
  });

  return sendSuccess(res, view, 'Saved view created', 201);
});

export const updateSavedView = asyncHandler(async (req, res) => {
  const view = await SavedView.findOne({ _id: req.params.id, isDeleted: false });
  if (!view) throw new AppError('View not found.', 404);

  const isOwner = String(view.owner) === String(req.user._id);
  const isAdmin = req.user.role === ROLES.ADMIN;
  if (!isOwner && !isAdmin) {
    throw new AppError('You can only modify your own saved views.', 403);
  }

  if (req.validatedBody.isDefault) {
    await SavedView.updateMany(
      { owner: req.user._id, entityType: view.entityType, isDeleted: false },
      { isDefault: false }
    );
  }

  Object.assign(view, req.validatedBody);
  await view.save();

  return sendSuccess(res, view, 'Saved view updated');
});

export const duplicateSavedView = asyncHandler(async (req, res) => {
  const src = await SavedView.findOne({ _id: req.params.id, isDeleted: false }).lean();
  if (!src) throw new AppError('View not found.', 404);

  const copy = await SavedView.create({
    name: `${src.name} (Copy)`,
    entityType: src.entityType,
    viewMode: src.viewMode,
    owner: req.user._id,
    isShared: false,
    isPinned: false,
    isDefault: false,
    config: src.config,
  });

  return sendSuccess(res, copy, 'View duplicated', 201);
});

export const deleteSavedView = asyncHandler(async (req, res) => {
  const view = await SavedView.findOne({ _id: req.params.id, isDeleted: false });
  if (!view) throw new AppError('View not found.', 404);

  const isOwner = String(view.owner) === String(req.user._id);
  const isAdmin = req.user.role === ROLES.ADMIN;
  if (!isOwner && !isAdmin) {
    throw new AppError('You can only delete your own saved views.', 403);
  }

  view.isDeleted = true;
  await view.save();
  return sendSuccess(res, null, 'View deleted');
});

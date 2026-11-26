import ScreenRegistry from '../models/ScreenRegistry.js';
import PermissionGroup from '../models/PermissionGroup.js';
import UserPermissions from '../models/UserPermissions.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { ensureScreenRegistrySeeded, getEffectivePermissions } from '../services/rbacService.js';
import { recordAudit } from '../services/auditService.js';
import { emitBroadcast } from '../services/notificationService.js';

export const getMyPermissions = asyncHandler(async (req, res) => {
  const effective = await getEffectivePermissions(req.user);
  return sendSuccess(res, effective, 'Effective permissions loaded');
});

export const getScreenRegistry = asyncHandler(async (req, res) => {
  const screens = await ensureScreenRegistrySeeded();
  return sendSuccess(res, screens, 'Screen registry loaded');
});

export const updateRegisteredScreen = asyncHandler(async (req, res) => {
  const { label, navigationGroup, description, active, defaultRoleAccess, availableActions } = req.body;
  const screen = await ScreenRegistry.findOne({ screenKey: req.params.key });
  if (!screen) throw new AppError('Registered screen not found', 404);

  const prev = { label: screen.label, navigationGroup: screen.navigationGroup, active: screen.active, defaultRoleAccess: screen.defaultRoleAccess };
  if (label) screen.label = label;
  if (navigationGroup) screen.navigationGroup = navigationGroup;
  if (description !== undefined) screen.description = description;
  if (active !== undefined) screen.active = Boolean(active);
  if (defaultRoleAccess) screen.defaultRoleAccess = { ...screen.defaultRoleAccess, ...defaultRoleAccess };
  if (Array.isArray(availableActions)) screen.availableActions = availableActions;
  await screen.save();

  await recordAudit({
    actorId: req.user._id,
    action: 'SCREEN_REGISTRY_UPDATED',
    recordType: 'ScreenRegistry',
    recordId: screen._id,
    recordRef: screen.screenKey,
    previousValue: prev,
    newValue: { label: screen.label, navigationGroup: screen.navigationGroup, active: screen.active, defaultRoleAccess: screen.defaultRoleAccess },
    module: 'rbac',
  });
  emitBroadcast('permissions:updated', { scope: 'global' });
  return sendSuccess(res, screen, 'Screen registry updated');
});

export const getPermissionGroups = asyncHandler(async (req, res) => {
  const groups = await PermissionGroup.find({}).sort({ name: 1 }).lean();
  const assignments = await UserPermissions.find({}).select('userId permissionGroups').populate('userId', 'fullName email role').lean();
  const enriched = groups.map((g) => ({
    ...g,
    members: assignments.filter((a) => (a.permissionGroups || []).map(String).includes(String(g._id))).map((a) => a.userId).filter(Boolean),
  }));
  return sendSuccess(res, enriched, 'Permission groups retrieved');
});

export const createPermissionGroup = asyncHandler(async (req, res) => {
  const { name, description = '', screenPermissions = [], actionPermissions = {} } = req.body;
  if (!name?.trim()) throw new AppError('Group name is required', 400);
  const exists = await PermissionGroup.findOne({ name: name.trim() });
  if (exists) throw new AppError('A permission group with this name already exists', 409);

  const group = await PermissionGroup.create({
    name: name.trim(),
    description,
    screenPermissions,
    actionPermissions,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  await recordAudit({
    actorId: req.user._id,
    action: 'PERMISSION_GROUP_CREATED',
    recordType: 'PermissionGroup',
    recordId: group._id,
    recordRef: group.name,
    newValue: { screenPermissions, actionPermissions },
    module: 'rbac',
  });
  return sendSuccess(res, group, 'Permission group created', 201);
});

export const updatePermissionGroup = asyncHandler(async (req, res) => {
  const group = await PermissionGroup.findById(req.params.id);
  if (!group) throw new AppError('Permission group not found', 404);
  const prev = { name: group.name, screenPermissions: group.screenPermissions, actionPermissions: group.actionPermissions };

  const { name, description, screenPermissions, actionPermissions } = req.body;
  if (name) group.name = name.trim();
  if (description !== undefined) group.description = description;
  if (Array.isArray(screenPermissions)) group.screenPermissions = screenPermissions;
  if (actionPermissions) group.actionPermissions = actionPermissions;
  group.updatedBy = req.user._id;
  await group.save();

  await recordAudit({
    actorId: req.user._id,
    action: 'PERMISSION_GROUP_UPDATED',
    recordType: 'PermissionGroup',
    recordId: group._id,
    recordRef: group.name,
    previousValue: prev,
    newValue: { name: group.name, screenPermissions: group.screenPermissions, actionPermissions: group.actionPermissions },
    module: 'rbac',
  });
  emitBroadcast('permissions:updated', { scope: 'group', groupId: group._id });
  return sendSuccess(res, group, 'Permission group updated');
});

export const deletePermissionGroup = asyncHandler(async (req, res) => {
  const group = await PermissionGroup.findById(req.params.id);
  if (!group) throw new AppError('Permission group not found', 404);
  await UserPermissions.updateMany({ permissionGroups: group._id }, { $pull: { permissionGroups: group._id } });
  await group.deleteOne();

  await recordAudit({
    actorId: req.user._id,
    action: 'PERMISSION_GROUP_DELETED',
    recordType: 'PermissionGroup',
    recordId: req.params.id,
    recordRef: group.name,
    previousValue: { name: group.name },
    module: 'rbac',
  });
  emitBroadcast('permissions:updated', { scope: 'group', groupId: req.params.id });
  return sendSuccess(res, null, 'Permission group deleted');
});

export const getUserPermissionsDetail = asyncHandler(async (req, res) => {
  const targetUser = await User.findOne({ _id: req.params.userId, isDeleted: false }).lean();
  if (!targetUser) throw new AppError('User not found', 404);

  const [config, effective, history] = await Promise.all([
    UserPermissions.findOne({ userId: targetUser._id }).populate('updatedBy', 'fullName email').lean(),
    getEffectivePermissions(targetUser),
    AuditLog.find({ recordType: { $in: ['UserPermissions', 'User'] }, recordId: String(targetUser._id) })
      .populate('actorId', 'fullName email')
      .sort({ timestamp: -1 })
      .limit(20)
      .lean(),
  ]);

  return sendSuccess(res, { user: targetUser, config: config || null, effective, history }, 'User permissions loaded');
});

export const updateUserPermissions = asyncHandler(async (req, res) => {
  const targetUser = await User.findOne({ _id: req.params.userId, isDeleted: false });
  if (!targetUser) throw new AppError('User not found', 404);

  const {
    role,
    permissionGroups = [],
    screenPermissions = [],
    revokedScreens = [],
    actionOverrides = { grant: {}, deny: {} },
  } = req.body;

  const prevEffective = await getEffectivePermissions(targetUser);

  if (role && ['admin', 'team_lead', 'developer'].includes(role) && String(targetUser._id) !== String(req.user._id)) {
    targetUser.role = role;
    await targetUser.save();
  }

  const updated = await UserPermissions.findOneAndUpdate(
    { userId: targetUser._id },
    {
      userId: targetUser._id,
      role: targetUser.role,
      permissionGroups,
      screenPermissions,
      revokedScreens,
      actionOverrides,
      updatedBy: req.user._id,
    },
    { upsert: true, new: true }
  );

  const nextEffective = await getEffectivePermissions(targetUser);

  await recordAudit({
    actorId: req.user._id,
    action: 'USER_PERMISSIONS_UPDATED',
    recordType: 'UserPermissions',
    recordId: targetUser._id,
    recordRef: targetUser.employeeId || targetUser.email,
    previousValue: { role: prevEffective.role, screens: prevEffective.screens, actions: prevEffective.actions },
    newValue: { role: targetUser.role, screens: nextEffective.screens, actions: nextEffective.actions },
    module: 'rbac',
  });

  emitBroadcast('permissions:updated', { userId: String(targetUser._id) });
  return sendSuccess(res, { config: updated, effective: nextEffective }, 'Permissions updated successfully');
});

export const copyUserPermissions = asyncHandler(async (req, res) => {
  const targetUser = await User.findOne({ _id: req.params.userId, isDeleted: false });
  const sourceUser = await User.findOne({ _id: req.params.sourceUserId, isDeleted: false });
  if (!targetUser || !sourceUser) throw new AppError('Target or source user not found', 404);

  const sourceEffective = await getEffectivePermissions(sourceUser);
  const sourceConfig = await UserPermissions.findOne({ userId: sourceUser._id }).lean();

  const updated = await UserPermissions.findOneAndUpdate(
    { userId: targetUser._id },
    {
      userId: targetUser._id,
      role: targetUser.role,
      permissionGroups: sourceConfig?.permissionGroups || [],
      screenPermissions: sourceEffective.screens || [],
      revokedScreens: sourceConfig?.revokedScreens || [],
      actionOverrides: sourceConfig?.actionOverrides || { grant: sourceEffective.actions || {}, deny: {} },
      updatedBy: req.user._id,
    },
    { upsert: true, new: true }
  );

  await recordAudit({
    actorId: req.user._id,
    action: 'USER_PERMISSIONS_COPIED',
    recordType: 'UserPermissions',
    recordId: targetUser._id,
    recordRef: targetUser.employeeId || targetUser.email,
    newValue: { copiedFrom: sourceUser.email, screens: sourceEffective.screens },
    module: 'rbac',
  });

  const nextEffective = await getEffectivePermissions(targetUser);
  emitBroadcast('permissions:updated', { userId: String(targetUser._id) });
  return sendSuccess(res, { config: updated, effective: nextEffective }, `Copied permissions from ${sourceUser.fullName}`);
});

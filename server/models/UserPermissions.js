import mongoose from 'mongoose';

const userPermissionsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    role: { type: String, default: 'developer' },
    permissionGroups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PermissionGroup' }],
    screenPermissions: [{ type: String, trim: true }], // explicitly granted screens
    revokedScreens: [{ type: String, trim: true }],    // explicitly denied screens (takes precedence)
    actionOverrides: {
      grant: { type: mongoose.Schema.Types.Mixed, default: {} }, // { [screenKey]: ['approve', ...] }
      deny: { type: mongoose.Schema.Types.Mixed, default: {} },  // { [screenKey]: ['delete', ...] }
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const UserPermissions = mongoose.model('UserPermissions', userPermissionsSchema);
export default UserPermissions;

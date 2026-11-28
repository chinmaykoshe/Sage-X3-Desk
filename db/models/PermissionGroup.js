import mongoose from 'mongoose';

const permissionGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    screenPermissions: [{ type: String, trim: true }],
    actionPermissions: { type: mongoose.Schema.Types.Mixed, default: {} }, // { [screenKey]: ['view', 'create', ...] }
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const PermissionGroup = mongoose.model('PermissionGroup', permissionGroupSchema);
export default PermissionGroup;

import mongoose from 'mongoose';

const screenRegistrySchema = new mongoose.Schema(
  {
    screenKey: { type: String, required: true, unique: true, trim: true, index: true },
    label: { type: String, required: true, trim: true },
    route: { type: String, required: true, trim: true },
    navigationGroup: {
      type: String,
      enum: ['WORKSPACE', 'TICKET MANAGEMENT', 'MANAGEMENT', 'INSIGHTS', 'ADMINISTRATION', 'SYSTEM'],
      required: true,
    },
    parentKey: { type: String, default: null },
    description: { type: String, default: '' },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 100 },
    defaultRoleAccess: {
      admin: { type: Boolean, default: true },
      team_lead: { type: Boolean, default: false },
      developer: { type: Boolean, default: false },
    },
    availableActions: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

const ScreenRegistry = mongoose.model('ScreenRegistry', screenRegistrySchema);
export default ScreenRegistry;

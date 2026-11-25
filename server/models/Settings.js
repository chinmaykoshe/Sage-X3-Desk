import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'global' },
    companyName: { type: String, default: 'Sage X3 Desk Operations' },
    defaultSlaHours: {
      Critical: { type: Number, default: 4 },
      High: { type: Number, default: 24 },
      Medium: { type: Number, default: 72 },
      Low: { type: Number, default: 120 },
    },
    requireApprovalForProductionDeployment: { type: Boolean, default: true },
    allowManagerCloseTicketWaiver: { type: Boolean, default: true },
    emailNotificationsEnabled: { type: Boolean, default: false },
    workingHoursPerDay: { type: Number, default: 8 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const Settings = mongoose.model('Settings', settingsSchema);
export default Settings;

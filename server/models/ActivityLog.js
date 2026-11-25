import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, index: true },
    entityType: {
      type: String,
      enum: ['ticket', 'task', 'client', 'project', 'deployment', 'user', 'timeLog', 'comment', 'settings'],
      required: true,
      index: true,
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    entityRef: { type: String, default: '' }, // Human readable ID like TKT-1001
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null, index: true },
    summary: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

activityLogSchema.index({ createdAt: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
export default ActivityLog;

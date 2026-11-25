import mongoose from 'mongoose';
import {
  TICKET_CATEGORIES,
  PRIORITIES,
  SEVERITIES,
  TICKET_STATUSES,
  DEPLOYMENT_ENVIRONMENTS,
} from '../config/constants.js';

const ticketStatusHistorySchema = new mongoose.Schema(
  {
    fromStatus: { type: String, default: null },
    toStatus: { type: String, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const ticketSchema = new mongoose.Schema(
  {
    ticketId: { type: String, unique: true, index: true },
    title: { type: String, required: true, trim: true, index: true },
    description: { type: String, required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    category: { type: String, enum: TICKET_CATEGORIES, required: true, index: true },
    priority: { type: String, enum: PRIORITIES, default: 'Medium', index: true },
    severity: { type: String, enum: SEVERITIES, default: 'Minor' },
    status: { type: String, enum: TICKET_STATUSES, default: 'New', index: true },
    reportedBy: { type: String, default: 'Client Contact' },
    reportedByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedDevelopers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
    assignedTeamLead: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    dueDate: { type: Date, default: null, index: true },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    reopenedCount: { type: Number, default: 0 },
    sageX3Environment: {
      type: String,
      enum: [...DEPLOYMENT_ENVIRONMENTS, 'UAT', 'Sandbox'],
      default: 'Pilot',
    },
    folderCode: { type: String, default: '', trim: true, uppercase: true },
    internalNotes: { type: String, default: '' },
    slaDueAt: { type: Date, default: null },
    slaMet: { type: Boolean, default: null },
    waivedIncompleteTasksOnClose: { type: Boolean, default: false },
    waivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    waiveReason: { type: String, default: '' },
    sortOrder: { type: Number, default: 1000, index: true },
    statusHistory: [ticketStatusHistorySchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ticketSchema.index({ title: 'text', ticketId: 'text', description: 'text' });

const Ticket = mongoose.model('Ticket', ticketSchema);
export default Ticket;

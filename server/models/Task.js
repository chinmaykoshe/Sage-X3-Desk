import mongoose from 'mongoose';
import { PRIORITIES, TASK_STATUSES } from '../config/constants.js';

const taskStatusHistorySchema = new mongoose.Schema(
  {
    fromStatus: { type: String, default: null },
    toStatus: { type: String, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    taskId: { type: String, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null, index: true },
    parentTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null, index: true },
    dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
    isIndependentInternalTask: { type: Boolean, default: false },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    assignedEmployees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
    priority: { type: String, enum: PRIORITIES, default: 'Medium', index: true },
    status: { type: String, enum: TASK_STATUSES, default: 'Todo', index: true },
    startDate: { type: Date, default: Date.now },
    dueDate: { type: Date, default: null, index: true },
    completedAt: { type: Date, default: null },
    estimatedHours: { type: Number, default: 0, min: 0 },
    actualHours: { type: Number, default: 0, min: 0 },
    completionPercentage: { type: Number, default: 0, min: 0, max: 100 },
    submittedForReview: { type: Boolean, default: false },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sortOrder: { type: Number, default: 1000, index: true },
    statusHistory: [taskStatusHistorySchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Task = mongoose.model('Task', taskSchema);
export default Task;

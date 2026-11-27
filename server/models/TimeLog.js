import mongoose from 'mongoose';

const timeLogSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    projectCode: { type: String, trim: true, default: '' },
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null, index: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null, index: true },
    taskTitle: { type: String, trim: true, default: '' },
    taskType: { type: String, trim: true, default: '' },
    entryStatus: {
      type: String,
      enum: ['DONE', 'IN PROGRESS', 'PENDING', 'BLOCKED'],
      default: 'DONE',
      index: true,
    },
    date: { type: Date, required: true, default: Date.now, index: true },
    hoursSpent: { type: Number, required: true, min: 0.1, max: 24 },
    workDescription: { type: String, required: true, trim: true },
    billable: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const TimeLog = mongoose.model('TimeLog', timeLogSchema);
export default TimeLog;

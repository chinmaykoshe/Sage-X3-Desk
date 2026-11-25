import mongoose from 'mongoose';

const timeLogSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null, index: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
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

import mongoose from 'mongoose';
import { DEPLOYMENT_ENVIRONMENTS } from '../config/constants.js';

const developmentActivitySchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null, index: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null, index: true },
    description: { type: String, required: true, trim: true },
    investigationNotes: { type: String, default: '' },
    affectedComponent: { type: String, default: '', trim: true },
    changesImplemented: { type: String, default: '' },
    testingPerformed: { type: String, default: '' },
    environment: {
      type: String,
      enum: [...DEPLOYMENT_ENVIRONMENTS, 'UAT', 'Sandbox', 'Local'],
      default: 'Development',
    },
    workStatus: {
      type: String,
      enum: ['Investigating', 'In Development', 'Code Review', 'Testing', 'Ready for Pilot', 'Completed'],
      default: 'In Development',
    },
    timeSpent: { type: Number, default: 0, min: 0 },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

developmentActivitySchema.index({ ticketId: 1, timestamp: -1 });
developmentActivitySchema.index({ employeeId: 1, timestamp: -1 });

const DevelopmentActivity = mongoose.model('DevelopmentActivity', developmentActivitySchema);
export default DevelopmentActivity;

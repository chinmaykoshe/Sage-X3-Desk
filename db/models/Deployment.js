import mongoose from 'mongoose';
import {
  DEPLOYMENT_ENVIRONMENTS,
  DEPLOYMENT_STAGES,
  DEPLOYMENT_APPROVAL_STATUSES,
  DEPLOYMENT_TESTING_STATUSES,
} from '../../backend/config/constants.js';

const deploymentHistorySchema = new mongoose.Schema(
  {
    stage: { type: String, required: true },
    environment: { type: String, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedAt: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const deploymentSchema = new mongoose.Schema(
  {
    deploymentId: { type: String, unique: true, index: true },
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null, index: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    sageX3Folder: { type: String, required: true, trim: true, uppercase: true },
    environment: {
      type: String,
      enum: DEPLOYMENT_ENVIRONMENTS,
      default: 'Development',
      index: true,
    },
    workflowStage: {
      type: String,
      enum: DEPLOYMENT_STAGES,
      default: 'Development Completed',
      index: true,
    },
    versionReference: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    patchObjects: { type: String, default: '' }, // e.g., 4GL scripts, screens, windows, tables
    deployedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deploymentDate: { type: Date, default: Date.now },
    approvalStatus: {
      type: String,
      enum: DEPLOYMENT_APPROVAL_STATUSES,
      default: 'Pending',
      index: true,
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    approvalNotes: { type: String, default: '' },
    testingStatus: {
      type: String,
      enum: DEPLOYMENT_TESTING_STATUSES,
      default: 'Pending',
    },
    testedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deploymentNotes: { type: String, default: '' },
    history: [deploymentHistorySchema],
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Deployment = mongoose.model('Deployment', deploymentSchema);
export default Deployment;

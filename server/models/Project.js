import mongoose from 'mongoose';
import { PROJECT_STATUSES } from '../config/constants.js';

const projectSchema = new mongoose.Schema(
  {
    projectId: { type: String, unique: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    description: { type: String, default: '' },
    projectManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    teamMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    startDate: { type: Date, default: Date.now },
    targetCompletionDate: { type: Date, default: null },
    status: { type: String, enum: PROJECT_STATUSES, default: 'Active', index: true },
    progressPercentage: { type: Number, default: 0, min: 0, max: 100 },
    sageX3Modules: [{ type: String, trim: true }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Project = mongoose.model('Project', projectSchema);
export default Project;

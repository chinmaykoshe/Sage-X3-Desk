import mongoose from 'mongoose';
import { DEPLOYMENT_ENVIRONMENTS } from '../config/constants.js';

const environmentSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    name: { type: String, required: true, trim: true },
    environmentType: {
      type: String,
      enum: [...DEPLOYMENT_ENVIRONMENTS, 'UAT', 'Sandbox'],
      default: 'Pilot',
    },
    folderCode: { type: String, required: true, trim: true, uppercase: true },
    serverUrl: { type: String, default: '' },
    databaseName: { type: String, default: '' },
    patchLevel: { type: String, default: '' },
    notes: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Environment = mongoose.model('Environment', environmentSchema);
export default Environment;

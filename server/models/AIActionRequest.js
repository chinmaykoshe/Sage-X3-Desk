import mongoose from 'mongoose';

const aiActionRequestSchema = new mongoose.Schema(
  {
    actionType: {
      type: String,
      enum: ['CREATE_USER', 'CREATE_CLIENT', 'CREATE_PROJECT'],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    summary: { type: String, default: '' },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['Pending TL Approval', 'Approved', 'Rejected'],
      default: 'Pending TL Approval',
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, default: '' },
    createdRecordId: { type: mongoose.Schema.Types.ObjectId },
    createdRecordType: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('AIActionRequest', aiActionRequestSchema);

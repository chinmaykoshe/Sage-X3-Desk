import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ['ticket', 'task', 'client', 'deployment', 'comment', 'project'],
      required: true,
      index: true,
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    originalName: { type: String, required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isInternal: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Attachment = mongoose.model('Attachment', attachmentSchema);
export default Attachment;

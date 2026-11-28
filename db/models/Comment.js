import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ['ticket', 'task', 'deployment', 'project'],
      required: true,
      index: true,
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    parentComment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null, index: true },
    body: { type: String, required: true, trim: true },
    isInternal: { type: Boolean, default: true, index: true },
    editedAt: { type: Date, default: null },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Attachment' }],
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Comment = mongoose.model('Comment', commentSchema);
export default Comment;

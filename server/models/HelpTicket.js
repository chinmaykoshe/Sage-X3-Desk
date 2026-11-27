import mongoose from 'mongoose';

const fileAttachmentSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 },
    url: { type: String, required: true },
  },
  { _id: true }
);

const helpCommentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true },
    attachments: [fileAttachmentSchema],
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const helpTicketSchema = new mongoose.Schema(
  {
    helpTicketId: { type: String, unique: true, index: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: [
        'UI / Layout Bug',
        'Login & Access Issue',
        'Performance / Slow',
        'AI Assistant Issue',
        'Timesheet / Calendar',
        'Email Integration',
        'Data / Sync Error',
        'Feature Request',
        'Other',
      ],
      default: 'UI / Layout Bug',
      index: true,
    },
    severity: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Medium',
      index: true,
    },
    pageUrl: { type: String, default: '', trim: true },
    browserInfo: { type: String, default: '', trim: true },
    attachments: [fileAttachmentSchema],
    status: {
      type: String,
      enum: ['Open', 'Under Review', 'In Progress', 'Resolved', 'Closed'],
      default: 'Open',
      index: true,
    },
    adminNotes: { type: String, default: '', trim: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    comments: [helpCommentSchema],
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

const HelpTicket = mongoose.model('HelpTicket', helpTicketSchema);
export default HelpTicket;

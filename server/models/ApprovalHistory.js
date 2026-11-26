import mongoose from 'mongoose';

const approvalHistorySchema = new mongoose.Schema(
  {
    draftId: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketDraft', default: null, index: true },
    draftRef: { type: String, default: '' },
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null, index: true },
    ticketRef: { type: String, default: '' },
    action: {
      type: String,
      enum: [
        'SUBMITTED',
        'RESUBMITTED',
        'AUTO_APPROVED',
        'APPROVED',
        'EDITED_AND_APPROVED',
        'REJECTED',
        'CHANGES_REQUESTED',
      ],
      required: true,
    },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvalMode: { type: String, enum: ['AUTOMATIC', 'MANUAL'], default: 'MANUAL' },
    comments: { type: String, default: '' },
    previousStatus: { type: String, default: '' },
    newStatus: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const ApprovalHistory = mongoose.model('ApprovalHistory', approvalHistorySchema);
export default ApprovalHistory;

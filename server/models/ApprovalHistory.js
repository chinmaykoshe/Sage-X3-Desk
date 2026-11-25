import mongoose from 'mongoose';

const approvalHistorySchema = new mongoose.Schema(
  {
    draftId: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketDraft', required: true, index: true },
    draftRef: { type: String, default: '' },
    action: {
      type: String,
      enum: ['SUBMITTED', 'RESUBMITTED', 'APPROVED', 'EDITED_AND_APPROVED', 'REJECTED', 'CHANGES_REQUESTED'],
      required: true,
    },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    comments: { type: String, default: '' },
    previousStatus: { type: String, default: '' },
    newStatus: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const ApprovalHistory = mongoose.model('ApprovalHistory', approvalHistorySchema);
export default ApprovalHistory;

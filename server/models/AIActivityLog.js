import mongoose from 'mongoose';

const aiActivityLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIConversation', default: null },
    detectedIntent: { type: String, default: 'GENERAL_ANSWER', index: true },
    executedAction: { type: String, default: '' },
    executionResult: { type: String, enum: ['success', 'denied', 'failed', 'draft_created', 'pending_approval'], default: 'success' },
    ticketDraftId: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketDraft', default: null },
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null },
    ocrStatus: { type: String, default: 'none' },
    ollamaStatus: { type: String, default: 'unknown' },
    modelName: { type: String, default: 'qwen2.5-coder:1.5b' },
    processingDurationMs: { type: Number, default: 0 },
    errorMessage: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

const AIActivityLog = mongoose.model('AIActivityLog', aiActivityLogSchema);
export default AIActivityLog;

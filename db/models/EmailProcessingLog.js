import mongoose from 'mongoose';

const emailProcessingLogSchema = new mongoose.Schema(
  {
    mailboxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailIntegration',
      required: true,
      index: true,
    },
    emailMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailMessage',
      default: null,
      index: true,
    },
    processingStage: {
      type: String,
      enum: [
        'webhook_received',
        'fetch_messages',
        'deduplication',
        'thread_matching',
        'ai_analysis',
        'attachment_sync',
        'ticket_created',
        'ticket_updated',
        'manual_review',
        'subscription_renew',
        'reconciliation',
        'error',
      ],
      required: true,
    },
    result: { type: String, enum: ['success', 'skipped', 'review', 'failed'], default: 'success' },
    message: { type: String, default: '' },
    error: { type: String, default: '' },
    processingDurationMs: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

const EmailProcessingLog = mongoose.model('EmailProcessingLog', emailProcessingLogSchema);
export default EmailProcessingLog;

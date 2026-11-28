import mongoose from 'mongoose';

const emailMessageSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['outlook', 'gmail'], required: true, index: true },
    mailboxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailIntegration',
      required: true,
      index: true,
    },
    providerMessageId: { type: String, required: true },
    internetMessageId: { type: String, default: '', index: true },
    conversationId: { type: String, default: '', index: true },
    inReplyTo: { type: String, default: '', index: true },
    references: [{ type: String }],
    sender: {
      name: { type: String, default: '' },
      email: { type: String, default: '', lowercase: true, trim: true, index: true },
    },
    recipients: [{ type: String }],
    cc: [{ type: String }],
    bcc: [{ type: String }],
    subject: { type: String, default: '(No Subject)' },
    plainBody: { type: String, default: '' },
    htmlBody: { type: String, default: '' },
    receivedAt: { type: Date, default: Date.now, index: true },
    attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Attachment' }],
    attachmentHashes: [{ type: String }],
    processingStatus: {
      type: String,
      enum: ['Queued', 'Processing', 'Processed', 'Unmatched', 'Pending Review', 'Failed', 'Ignored'],
      default: 'Queued',
      index: true,
    },
    matchedClientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    relatedTicketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null, index: true },
    candidateTicketIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' }],
    matchMethod: { type: String, default: '' },
    matchRationale: { type: String, default: '' },
    aiConfidence: { type: Number, default: 0 },
    aiAnalysis: { type: mongoose.Schema.Types.Mixed, default: null },
    errorMessage: { type: String, default: '' },
    rawMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    providerMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

emailMessageSchema.index({ provider: 1, mailboxId: 1, providerMessageId: 1 }, { unique: true });

const EmailMessage = mongoose.model('EmailMessage', emailMessageSchema);
export default EmailMessage;

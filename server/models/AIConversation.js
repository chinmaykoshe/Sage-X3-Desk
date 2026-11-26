import mongoose from 'mongoose';

const aiMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    intent: { type: String, default: null },
    action: { type: mongoose.Schema.Types.Mixed, default: null },
    draftId: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketDraft', default: null },
    attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Attachment' }],
    clarificationOptions: [{ type: mongoose.Schema.Types.Mixed }],
    statusType: {
      type: String,
      enum: ['response', 'navigation', 'search', 'draft', 'approval', 'success', 'warning', 'error'],
      default: 'response',
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const aiConversationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: 'New X3 AI Conversation', trim: true },
    messages: [aiMessageSchema],
    contextState: {
      lastClientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
      lastClientName: { type: String, default: null },
      lastEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      lastEmployeeName: { type: String, default: null },
      lastIntent: { type: String, default: null },
      lastFilters: { type: mongoose.Schema.Types.Mixed, default: {} },
      lastResultIds: [{ type: String }],
      lastTicketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null },
    },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const AIConversation = mongoose.model('AIConversation', aiConversationSchema);
export default AIConversation;

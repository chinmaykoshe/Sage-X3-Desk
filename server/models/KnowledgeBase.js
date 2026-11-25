import mongoose from 'mongoose';

const knowledgeBaseSchema = new mongoose.Schema(
  {
    articleId: { type: String, unique: true, index: true },
    title: { type: String, required: true, trim: true, index: true },
    category: {
      type: String,
      enum: ['4GL Scripting', 'Import / Export', 'Web Services & API', 'Crystal Reports', 'Database & Patching', 'Finance & Banking', 'Supply Chain & Stock', 'Runbook'],
      default: '4GL Scripting',
      index: true,
    },
    sageX3Version: { type: String, default: 'V12' },
    tags: [{ type: String, trim: true }],
    summary: { type: String, default: '' },
    content: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    relatedTickets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' }],
    isPublished: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const KnowledgeBase = mongoose.model('KnowledgeBase', knowledgeBaseSchema);
export default KnowledgeBase;

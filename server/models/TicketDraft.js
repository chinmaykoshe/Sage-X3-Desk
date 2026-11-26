import mongoose from 'mongoose';
import {
  TICKET_CATEGORIES,
  PRIORITIES,
  SEVERITIES,
  DEPLOYMENT_ENVIRONMENTS,
} from '../config/constants.js';

const suggestedTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    priority: { type: String, enum: PRIORITIES, default: 'Medium' },
    estimatedHours: { type: Number, default: 2 },
    accepted: { type: Boolean, default: true },
  },
  { _id: true }
);

const ticketDraftSchema = new mongoose.Schema(
  {
    draftId: { type: String, unique: true, index: true },
    sourceType: {
      type: String,
      enum: ['screenshot', 'image', 'email', 'text', 'chat'],
      default: 'text',
    },
    sourceText: { type: String, default: '' },
    userView: { type: String, default: '' },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
    clientMatchConfidence: { type: Number, default: 0 },
    candidateClients: [
      {
        client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
        companyName: String,
        folderCode: String,
        score: Number,
      },
    ],
    extractedText: { type: String, default: '' },
    generatedFields: {
      title: { type: String, default: '' },
      description: { type: String, default: '' },
      shortDescription: { type: String, default: '' },
      mediumDescription: { type: String, default: '' },
      longDescription: { type: String, default: '' },
      category: { type: String, enum: [...TICKET_CATEGORIES, ''], default: 'Support Request' },
      priority: { type: String, enum: PRIORITIES, default: 'Medium' },
      severity: { type: String, enum: SEVERITIES, default: 'Minor' },
      environment: {
        type: String,
        enum: [...DEPLOYMENT_ENVIRONMENTS, 'UAT', 'Sandbox', 'Unknown'],
        default: 'Pilot',
      },
      folderCode: { type: String, default: '' },
      reportedIssue: { type: String, default: '' },
      expectedBehavior: { type: String, default: '' },
      actualBehavior: { type: String, default: '' },
      suggestedTroubleshootingSteps: [{ type: String }],
      suggestedAssignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      clientNameRaw: { type: String, default: '' },
    },
    suggestedTasks: [suggestedTaskSchema],
    attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Attachment' }],
    aiProcessingStatus: {
      type: String,
      enum: ['Incoming', 'AI Processing', 'Completed', 'Needs Clarification', 'Fallback Manual', 'Failed'],
      default: 'Completed',
    },
    approvalStatus: {
      type: String,
      enum: ['Incoming', 'AI Processing', 'Pending TL Approval', 'Changes Requested', 'Approved', 'Rejected'],
      default: 'Pending TL Approval',
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
    changeRequestNotes: { type: String, default: '' },
    approvedTicketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null },
    approvedTicketRef: { type: String, default: '' },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const TicketDraft = mongoose.model('TicketDraft', ticketDraftSchema);
export default TicketDraft;

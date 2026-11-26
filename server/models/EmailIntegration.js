import mongoose from 'mongoose';
import { PRIORITIES } from '../config/constants.js';

const automationRulesSchema = new mongoose.Schema(
  {
    autoCreateTickets: { type: Boolean, default: true },
    autoUpdateExistingTickets: { type: Boolean, default: true },
    ignoreSenders: [{ type: String, trim: true, lowercase: true }],
    ignoreFoldersOrLabels: [{ type: String, trim: true }],
    filterSpamAndAutoReplies: { type: Boolean, default: true },
    defaultPriority: { type: String, enum: PRIORITIES, default: 'Medium' },
    enableAiAnalysis: { type: Boolean, default: true },
    enableAttachmentProcessing: { type: Boolean, default: true },
    sendUncertainToReview: { type: Boolean, default: true },
    // Trusted-source auto-approval stays disabled by default; requires explicit Admin config
    trustedAutoApproval: { type: Boolean, default: false },
  },
  { _id: false }
);

const emailIntegrationSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ['outlook', 'gmail'],
      required: true,
      index: true,
    },
    mailboxAddress: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    displayName: { type: String, default: '', trim: true },
    // Non-secret reference metadata safe to display in UI
    publicConfig: {
      tenantId: { type: String, default: '' },
      clientId: { type: String, default: '' },
      projectId: { type: String, default: '' },
      pubsubTopic: { type: String, default: '' },
      authFlow: { type: String, default: 'oauth2' },
    },
    // AES-256-GCM encrypted credentials (clientSecret, accessToken, refreshToken, etc.)
    encryptedCredentials: { type: String, default: '', select: false },
    hasClientSecret: { type: Boolean, default: false },
    hasOAuthTokens: { type: Boolean, default: false },
    connectionStatus: {
      type: String,
      enum: ['Disconnected', 'Connected', 'Error', 'Expired'],
      default: 'Disconnected',
      index: true,
    },
    grantedScopes: [{ type: String }],
    subscriptionId: { type: String, default: '' },
    subscriptionExpiration: { type: Date, default: null },
    clientStateToken: { type: String, default: '', select: false },
    lastHistoryId: { type: String, default: '' },
    lastSyncedAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    automationRules: { type: automationRulesSchema, default: () => ({}) },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

emailIntegrationSchema.index({ provider: 1, mailboxAddress: 1 }, { unique: true });

const EmailIntegration = mongoose.model('EmailIntegration', emailIntegrationSchema);
export default EmailIntegration;

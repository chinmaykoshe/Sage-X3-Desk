import AIConversation from '../models/AIConversation.js';
import TicketDraft from '../models/TicketDraft.js';
import ApprovalHistory from '../models/ApprovalHistory.js';
import AIActionRequest from '../models/AIActionRequest.js';
import User from '../models/User.js';
import Client from '../models/Client.js';
import { ROLES } from '../config/constants.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { checkOllamaStatus } from '../services/ai/ollamaService.js';
import { retrieveRelevantContext } from '../services/ai/aiContextService.js';
import { parseUserIntent } from '../services/ai/aiIntentService.js';
import { executeIntent } from '../services/ai/aiNavigationService.js';
import {
  generateTicketDraftService,
  approveTicketDraftService,
  rejectTicketDraftService,
  requestDraftChangesService,
} from '../services/ai/aiTicketService.js';

export const getAiStatus = asyncHandler(async (req, res) => {
  const [status, pendingApprovals] = await Promise.all([
    checkOllamaStatus(),
    TicketDraft.countDocuments({ isDeleted: false, approvalStatus: 'Pending TL Approval' }),
  ]);
  return sendSuccess(res, { ...status, pendingApprovals }, 'AI status retrieved');
});

export const getConversations = asyncHandler(async (req, res) => {
  const convs = await AIConversation.find({ userId: req.user._id, isDeleted: false })
    .sort({ updatedAt: -1 })
    .limit(15)
    .lean();
  return sendSuccess(res, convs, 'AI conversations retrieved');
});

export const createConversation = asyncHandler(async (req, res) => {
  const conv = await AIConversation.create({
    userId: req.user._id,
    title: req.body?.title || 'New X3 AI Conversation',
    messages: [],
  });
  return sendSuccess(res, conv, 'Conversation started', 201);
});

export const deleteConversation = asyncHandler(async (req, res) => {
  await AIConversation.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { isDeleted: true }
  );
  return sendSuccess(res, null, 'Conversation cleared');
});

export const aiChat = asyncHandler(async (req, res) => {
  const message = (req.body.message || '').trim();
  const files = req.files || [];
  const conversationId = req.body.conversationId;

  if (!message && files.length === 0) {
    throw new AppError('Please enter a message or attach a screenshot.', 400);
  }

  let conversation = conversationId
    ? await AIConversation.findOne({ _id: conversationId, userId: req.user._id, isDeleted: false })
    : null;

  if (!conversation) {
    conversation = await AIConversation.create({
      userId: req.user._id,
      title: (message || 'Screenshot Ticket Intake').slice(0, 50),
      messages: [],
    });
  }

  // If image(s) attached in chat -> route straight into Smart Ticket Intake draft generation!
  if (files.length > 0) {
    const draft = await generateTicketDraftService({
      sourceType: 'chat',
      sourceText: message,
      clientIdOverride: req.body.clientId || null,
      files,
      actor: req.user,
    });

    const userMsg = {
      role: 'user',
      content: message || `Uploaded ${files.length} screenshot(s) for ticket intake.`,
      attachments: draft.attachments.map((a) => a._id),
    };
    const assistantMsg = {
      role: 'assistant',
      content: draft.clientId
        ? `Processed your screenshot via local OCR & X3 AI. Created draft ${draft.draftId} for ${draft.clientId.companyName} ("${draft.generatedFields.title}") and routed it to Pending TL Approval.`
        : `Processed your screenshot via local OCR & X3 AI and created draft ${draft.draftId} ("${draft.generatedFields.title}"). Please select the exact client in Smart Intake / TL Approval.`,
      intent: 'CREATE_TICKET_DRAFT',
      draftId: draft._id,
      statusType: draft.clientId ? 'draft' : 'warning',
      action: { type: 'OPEN_DRAFT', draftId: String(draft._id), route: `/approvals?draft=${draft._id}` },
    };

    conversation.messages.push(userMsg, assistantMsg);
    await conversation.save();

    return sendSuccess(
      res,
      {
        conversationId: conversation._id,
        userMessage: userMsg,
        assistantMessage: assistantMsg,
        draft,
      },
      'Processed screenshot ticket draft'
    );
  }

  const [ollamaStatus, context] = await Promise.all([
    checkOllamaStatus(),
    retrieveRelevantContext({ message, user: req.user, conversation }),
  ]);

  const parsed = await parseUserIntent({
    message,
    history: conversation.messages,
    context,
    ollamaAvailable: ollamaStatus.available && ollamaStatus.modelReady,
  });

  // If text-only CREATE_TICKET_DRAFT with substantial issue description (e.g. "ABC Manufacturing - Bank statement import issue...")
  if (parsed.intent === 'CREATE_TICKET_DRAFT' && message.length >= 25 && (context.matchedClient || parsed.entities?.description || message.includes('–') || message.includes('-'))) {
    const draft = await generateTicketDraftService({
      sourceType: 'chat',
      sourceText: message,
      clientIdOverride: context.matchedClient?.id || null,
      files: [],
      actor: req.user,
    });

    const userMsg = { role: 'user', content: message };
    const assistantMsg = {
      role: 'assistant',
      content: draft.clientId
        ? `Prepared ticket draft ${draft.draftId} for ${draft.clientId.companyName}: "${draft.generatedFields.title}" (${draft.generatedFields.priority} · ${draft.generatedFields.category}) with ${draft.suggestedTasks.length} suggested task(s). Sent to Pending TL Approval.`
        : `Prepared ticket draft ${draft.draftId}: "${draft.generatedFields.title}". Client was not verified automatically—open the draft to select the client before TL approval.`,
      intent: 'CREATE_TICKET_DRAFT',
      draftId: draft._id,
      statusType: draft.clientId ? 'draft' : 'warning',
      action: { type: 'OPEN_DRAFT', draftId: String(draft._id), route: `/approvals?draft=${draft._id}` },
    };

    conversation.messages.push(userMsg, assistantMsg);
    await conversation.save();

    return sendSuccess(res, {
      conversationId: conversation._id,
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      draft,
    });
  }

  const executed = await executeIntent({
    parsed,
    message,
    user: req.user,
    conversation,
  });

  if (executed.contextUpdates) {
    conversation.contextState = {
      ...conversation.contextState?.toObject?.(),
      ...executed.contextUpdates,
    };
  }

  const userMsg = { role: 'user', content: message };
  const assistantMsg = {
    role: 'assistant',
    content: executed.response || 'Done.',
    intent: parsed.intent,
    action: executed.action || null,
    clarificationOptions: executed.clarificationOptions || [],
    statusType: executed.statusType || 'response',
  };

  conversation.messages.push(userMsg, assistantMsg);
  await conversation.save();

  return sendSuccess(res, {
    conversationId: conversation._id,
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    ollamaStatus,
  });
});

export const smartIntakeCreateDraft = asyncHandler(async (req, res) => {
  const files = req.files || [];
  const { sourceText = '', sourceType = 'text', clientId = '' } = req.body;

  const draft = await generateTicketDraftService({
    sourceType,
    sourceText,
    clientIdOverride: clientId || null,
    files,
    actor: req.user,
  });

  return sendSuccess(res, draft, `Draft ${draft.draftId} created and submitted for TL approval`, 201);
});

export const getDrafts = asyncHandler(async (req, res) => {
  const { status, client, submittedBy, startDate, endDate, search } = req.query;
  const filter = { isDeleted: false };

  if (status && status !== 'All') filter.approvalStatus = status;
  if (client) filter.clientId = client;
  if (submittedBy) filter.submittedBy = submittedBy;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }
  if (search) {
    filter.$or = [
      { draftId: { $regex: search, $options: 'i' } },
      { 'generatedFields.title': { $regex: search, $options: 'i' } },
      { extractedText: { $regex: search, $options: 'i' } },
    ];
  }

  const [drafts, countsAgg] = await Promise.all([
    TicketDraft.find(filter)
      .populate('clientId', 'clientId companyName clientFolderCode pilotFolderCode productionFolderCode')
      .populate('submittedBy', 'fullName designation avatarColor')
      .populate('reviewedBy', 'fullName designation')
      .populate('attachments')
      .populate('approvedTicketId', 'ticketId status')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    TicketDraft.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$approvalStatus', count: { $sum: 1 } } },
    ]),
  ]);

  const counts = countsAgg.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  return sendSuccess(res, { drafts, counts }, 'Ticket drafts retrieved');
});

export const getDraftById = asyncHandler(async (req, res) => {
  const draft = await TicketDraft.findOne({ _id: req.params.id, isDeleted: false })
    .populate('clientId', 'clientId companyName clientFolderCode pilotFolderCode productionFolderCode sageX3Version')
    .populate('submittedBy', 'fullName designation avatarColor')
    .populate('reviewedBy', 'fullName designation')
    .populate('attachments')
    .populate('approvedTicketId', 'ticketId title status')
    .lean();

  if (!draft) throw new AppError('Ticket draft not found.', 404);

  const history = await ApprovalHistory.find({ draftId: draft._id })
    .populate('performedBy', 'fullName designation avatarColor')
    .sort({ timestamp: -1 })
    .lean();

  return sendSuccess(res, { ...draft, approvalHistory: history }, 'Draft details retrieved');
});

export const updateDraft = asyncHandler(async (req, res) => {
  const draft = await TicketDraft.findOne({ _id: req.params.id, isDeleted: false });
  if (!draft) throw new AppError('Ticket draft not found.', 404);

  const isManager = [ROLES.ADMIN, ROLES.TEAM_LEAD].includes(req.user.role);
  const isOwner = String(draft.submittedBy) === String(req.user._id);
  if (!isManager && !isOwner) {
    throw new AppError('You do not have permission to edit this draft.', 403);
  }
  if (draft.approvalStatus === 'Approved') {
    throw new AppError('Approved drafts cannot be modified.', 400);
  }

  const { clientId, generatedFields, suggestedTasks, resubmit } = req.body;
  if (clientId !== undefined) draft.clientId = clientId || null;
  if (generatedFields) {
    draft.generatedFields = { ...draft.generatedFields.toObject(), ...generatedFields };
  }
  if (Array.isArray(suggestedTasks)) {
    draft.suggestedTasks = suggestedTasks;
  }

  if (resubmit && draft.approvalStatus === 'Changes Requested') {
    const prev = draft.approvalStatus;
    draft.approvalStatus = 'Pending TL Approval';
    await ApprovalHistory.create({
      draftId: draft._id,
      draftRef: draft.draftId,
      action: 'RESUBMITTED',
      performedBy: req.user._id,
      comments: 'Updated and resubmitted for TL approval',
      previousStatus: prev,
      newStatus: 'Pending TL Approval',
    });
  }

  await draft.save();
  const populated = await TicketDraft.findById(draft._id)
    .populate('clientId', 'clientId companyName clientFolderCode')
    .populate('submittedBy', 'fullName designation avatarColor')
    .populate('attachments');

  return sendSuccess(res, populated, 'Draft updated');
});

export const approveDraft = asyncHandler(async (req, res) => {
  const { edits, selectedTaskIds, comments } = req.body;
  const result = await approveTicketDraftService({
    draftId: req.params.id,
    edits,
    selectedTaskIds,
    comments,
    actor: req.user,
  });
  return sendSuccess(res, result, `Draft approved and published as ${result.ticket.ticketId}`);
});

export const rejectDraft = asyncHandler(async (req, res) => {
  const draft = await rejectTicketDraftService({
    draftId: req.params.id,
    reason: req.body.reason,
    actor: req.user,
  });
  return sendSuccess(res, draft, 'Draft rejected');
});

export const requestDraftChanges = asyncHandler(async (req, res) => {
  const draft = await requestDraftChangesService({
    draftId: req.params.id,
    comments: req.body.comments,
    actor: req.user,
  });
  return sendSuccess(res, draft, 'Changes requested from submitter');
});

export const getActionRequests = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status && status !== 'All') filter.status = status;

  const [requests, pendingCount, approvedCount, rejectedCount] = await Promise.all([
    AIActionRequest.find(filter)
      .populate('requestedBy', 'name email role')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean(),
    AIActionRequest.countDocuments({ status: 'Pending TL Approval' }),
    AIActionRequest.countDocuments({ status: 'Approved' }),
    AIActionRequest.countDocuments({ status: 'Rejected' }),
  ]);

  return sendSuccess(res, {
    requests,
    counts: {
      'Pending TL Approval': pendingCount,
      Approved: approvedCount,
      Rejected: rejectedCount,
    },
  });
});

export const approveActionRequest = asyncHandler(async (req, res) => {
  const actionReq = await AIActionRequest.findById(req.params.id);
  if (!actionReq) throw new AppError('Action request not found', 404);
  if (actionReq.status !== 'Pending TL Approval') {
    throw new AppError(`Action request is already ${actionReq.status}`, 400);
  }

  let createdRecord = null;
  if (actionReq.actionType === 'CREATE_USER') {
    const { name, email, role, designation } = actionReq.payload || {};
    const existing = await User.findOne({ email: (email || '').toLowerCase() });
    if (existing) throw new AppError(`User with email ${email} already exists`, 409);
    const empCount = await User.countDocuments();
    createdRecord = await User.create({
      employeeId: `EMP-${100 + empCount + 1}`,
      name: name || 'New Team Member',
      email,
      password: 'Password@123',
      role: role || ROLES.DEVELOPER,
      designation: designation || 'Sage X3 Consultant',
    });
    actionReq.createdRecordId = createdRecord._id;
    actionReq.createdRecordType = 'User';
  } else if (actionReq.actionType === 'CREATE_CLIENT') {
    const { name, email, industry, sageX3Version } = actionReq.payload || {};
    const clientCount = await Client.countDocuments();
    createdRecord = await Client.create({
      clientCode: `CL-${100 + clientCount + 1}`,
      name: name || 'New Client',
      email: email || '',
      industry: industry || 'Manufacturing',
      sageX3Version: sageX3Version || 'V12',
      createdBy: req.user._id,
    });
    actionReq.createdRecordId = createdRecord._id;
    actionReq.createdRecordType = 'Client';
  }

  actionReq.status = 'Approved';
  actionReq.reviewedBy = req.user._id;
  actionReq.reviewedAt = new Date();
  await actionReq.save();

  return sendSuccess(res, { actionReq, createdRecord }, `${actionReq.title} approved and created`);
});

export const rejectActionRequest = asyncHandler(async (req, res) => {
  const actionReq = await AIActionRequest.findById(req.params.id);
  if (!actionReq) throw new AppError('Action request not found', 404);
  actionReq.status = 'Rejected';
  actionReq.reviewedBy = req.user._id;
  actionReq.reviewedAt = new Date();
  actionReq.rejectionReason = req.body.reason || 'Rejected by Team Lead';
  await actionReq.save();
  return sendSuccess(res, actionReq, 'Action request rejected');
});

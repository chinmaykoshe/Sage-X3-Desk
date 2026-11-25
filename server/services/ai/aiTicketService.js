import { z } from 'zod';
import Client from '../../models/Client.js';
import User from '../../models/User.js';
import Ticket from '../../models/Ticket.js';
import Task from '../../models/Task.js';
import Attachment from '../../models/Attachment.js';
import TicketDraft from '../../models/TicketDraft.js';
import ApprovalHistory from '../../models/ApprovalHistory.js';
import { getNextSequence } from '../../models/Counter.js';
import {
  TICKET_CATEGORIES,
  PRIORITIES,
  SEVERITIES,
  DEPLOYMENT_ENVIRONMENTS,
  ROLES,
  SLA_HOURS_BY_PRIORITY,
} from '../../config/constants.js';
import AppError from '../../utils/AppError.js';
import { extractTextFromImage, sanitizeExtractedText } from './ocrService.js';
import { checkOllamaStatus, chatWithOllama, extractJsonFromText } from './ollamaService.js';
import { buildTicketExtractionPrompt } from './aiPromptService.js';
import { matchClientDeterministic } from './aiContextService.js';
import { recordActivity } from '../activityService.js';
import { notifyUsers, emitBroadcast } from '../notificationService.js';

const aiDraftOutputSchema = z.object({
  clientName: z.string().optional().default(''),
  folderCode: z.string().optional().default(''),
  environment: z.enum([...DEPLOYMENT_ENVIRONMENTS, 'UAT', 'Sandbox', 'Unknown']).optional().default('Unknown'),
  title: z.string().optional().default(''),
  description: z.string().optional().default(''),
  category: z.enum(TICKET_CATEGORIES).optional().default('Support Request'),
  priority: z.enum(PRIORITIES).optional().default('Medium'),
  severity: z.enum(SEVERITIES).optional().default('Minor'),
  reportedIssue: z.string().optional().default(''),
  expectedBehavior: z.string().optional().default(''),
  actualBehavior: z.string().optional().default(''),
  suggestedTroubleshootingSteps: z.array(z.string()).optional().default([]),
  suggestedTasks: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().optional().default(''),
        priority: z.enum(PRIORITIES).optional().default('Medium'),
        estimatedHours: z.coerce.number().optional().default(2),
      })
    )
    .optional()
    .default([]),
});

function deterministicDraftFallback(combinedText, clientMatch) {
  const lines = combinedText.split('\n').map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] || 'Sage X3 Support Issue';
  const title = firstLine.length > 90 ? `${firstLine.slice(0, 87)}...` : firstLine;
  const lower = combinedText.toLowerCase();

  let category = 'Support Request';
  if (/bank|mt940|import|api|webhook|edi|sftp/i.test(lower)) category = 'Integration Issue';
  else if (/4gl|script|custom|z[a-z0-9_]+/i.test(lower)) category = 'Customization';
  else if (/error|exception|crash|fail|sql|ora-/i.test(lower)) category = 'Bug / Error';

  let priority = 'Medium';
  if (/urgent|critical|production\s+down|blocking/i.test(lower)) priority = 'Critical';
  else if (/fail|missing|timeout|error/i.test(lower)) priority = 'High';

  let environment = 'Unknown';
  let folderCode = '';
  if (/prod/i.test(lower)) environment = 'Production';
  else if (/pilot/i.test(lower)) environment = 'Pilot';
  else if (/dev/i.test(lower)) environment = 'Development';

  if (clientMatch.bestMatch) {
    if (environment === 'Production') folderCode = clientMatch.bestMatch.productionFolderCode || clientMatch.bestMatch.clientFolderCode;
    else if (environment === 'Pilot') folderCode = clientMatch.bestMatch.pilotFolderCode || clientMatch.bestMatch.clientFolderCode;
    else folderCode = clientMatch.bestMatch.clientFolderCode;
  }

  return {
    clientName: clientMatch.bestMatch?.companyName || '',
    folderCode,
    environment,
    title,
    description: combinedText.slice(0, 1500),
    category,
    priority,
    severity: priority === 'Critical' ? 'Critical' : 'Major',
    reportedIssue: firstLine,
    expectedBehavior: '',
    actualBehavior: combinedText.slice(0, 500),
    suggestedTroubleshootingSteps: [
      'Verify Sage X3 folder and reproduce in Pilot environment',
      'Check Syracuse / batch server trace logs',
    ],
    suggestedTasks: [
      { title: 'Investigate error logs and reproduce issue', priority, estimatedHours: 2 },
      { title: 'Verify fix in Pilot environment', priority: 'Medium', estimatedHours: 2 },
    ],
  };
}

/**
 * Processes uploaded screenshots (local OCR) + text/email descriptions via Ollama
 * and creates a TicketDraft in Pending TL Approval (or Needs Clarification).
 */
export async function generateTicketDraftService({
  sourceType = 'text',
  sourceText = '',
  clientIdOverride = null,
  files = [],
  actor,
}) {
  const sanitizedInput = sanitizeExtractedText(sourceText);
  const extractedParts = [];
  const attachmentDocs = [];

  for (const f of files) {
    const att = await Attachment.create({
      entityType: 'ticket',
      entityId: actor._id, // Temporarily scoped until draft/ticket is linked
      originalName: f.originalname,
      filename: f.filename,
      mimeType: f.mimetype,
      size: f.size,
      url: `/uploads/${f.filename}`,
      uploadedBy: actor._id,
      isInternal: true,
    });
    attachmentDocs.push(att);

    if (f.mimetype.startsWith('image/')) {
      try {
        const ocr = await extractTextFromImage(f.path);
        if (ocr.hasUsefulText) {
          extractedParts.push(`[OCR ${f.originalname} (${ocr.confidence}% conf)]:\n${ocr.text}`);
        }
      } catch (err) {
        console.warn('OCR failed for', f.originalname, err.message);
      }
    }
  }

  const ocrText = extractedParts.join('\n\n').trim();
  const combinedText = [sanitizedInput, ocrText].filter(Boolean).join('\n\n').trim();

  if (!combinedText) {
    throw new AppError(
      'Could not extract readable text from the uploaded image(s). Please upload a clearer screenshot or provide a manual issue description.',
      400
    );
  }

  const clients = await Client.find({ isDeleted: false })
    .select('clientId companyName aliases clientFolderCode pilotFolderCode productionFolderCode')
    .lean();

  let selectedClient = clientIdOverride ? clients.find((c) => String(c._id) === String(clientIdOverride)) : null;
  const clientMatch = selectedClient
    ? { bestMatch: selectedClient, confidence: 100, ambiguous: false, candidates: [] }
    : matchClientDeterministic(combinedText, clients);

  selectedClient = clientMatch.bestMatch;

  const ollamaStatus = await checkOllamaStatus();
  let structured = null;
  let aiStatus = 'Completed';

  if (ollamaStatus.available && ollamaStatus.modelReady) {
    try {
      const prompt = buildTicketExtractionPrompt({
        clientsSummary: clients.map((c) => ({
          name: c.companyName,
          folders: [c.clientFolderCode, c.pilotFolderCode, c.productionFolderCode].filter(Boolean),
        })),
      });

      const aiRes = await chatWithOllama({
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `UNTRUSTED ISSUE CONTENT:\n"""\n${combinedText}\n"""` },
        ],
        expectJson: true,
        temperature: 0.1,
      });

      const parsedJson = extractJsonFromText(aiRes.content);
      const validated = aiDraftOutputSchema.safeParse(parsedJson);
      if (validated.success && validated.data.title) {
        structured = validated.data;
      }
    } catch (err) {
      console.warn('Ollama draft extraction fallback:', err.message);
      aiStatus = 'Fallback Manual';
    }
  } else {
    aiStatus = 'Fallback Manual';
  }

  if (!structured) {
    structured = deterministicDraftFallback(combinedText, clientMatch);
  }

  // If deterministic match didn't lock a client, try matching the LLM-extracted clientName deterministically
  if (!selectedClient && structured.clientName) {
    const secondTry = matchClientDeterministic(structured.clientName, clients);
    if (secondTry.bestMatch) selectedClient = secondTry.bestMatch;
  }

  if (!selectedClient) {
    aiStatus = 'Needs Clarification';
  }

  const draftId = await getNextSequence('ticketDraft', 'DRF', 1001);
  const draft = await TicketDraft.create({
    draftId,
    sourceType: files.length > 0 ? (sourceType === 'chat' ? 'chat' : 'screenshot') : sourceType,
    sourceText: sanitizedInput,
    submittedBy: actor._id,
    clientId: selectedClient?._id || null,
    clientMatchConfidence: clientMatch.confidence,
    candidateClients: clientMatch.candidates,
    extractedText: ocrText,
    generatedFields: {
      title: structured.title || 'Sage X3 Issue Draft',
      description: structured.description || combinedText,
      category: structured.category || 'Support Request',
      priority: structured.priority || 'Medium',
      severity: structured.severity || 'Minor',
      environment: structured.environment || 'Pilot',
      folderCode: structured.folderCode || selectedClient?.pilotFolderCode || selectedClient?.clientFolderCode || '',
      reportedIssue: structured.reportedIssue || structured.title,
      expectedBehavior: structured.expectedBehavior || '',
      actualBehavior: structured.actualBehavior || '',
      suggestedTroubleshootingSteps: structured.suggestedTroubleshootingSteps || [],
      clientNameRaw: structured.clientName || '',
    },
    suggestedTasks: (structured.suggestedTasks || []).map((t) => ({
      title: t.title,
      description: t.description || '',
      priority: t.priority || 'Medium',
      estimatedHours: t.estimatedHours || 2,
      accepted: true,
    })),
    attachments: attachmentDocs.map((a) => a._id),
    aiProcessingStatus: aiStatus,
    approvalStatus: 'Pending TL Approval',
  });

  // Update attachment entityId to draft._id
  if (attachmentDocs.length > 0) {
    await Attachment.updateMany(
      { _id: { $in: attachmentDocs.map((a) => a._id) } },
      { entityId: draft._id }
    );
  }

  await ApprovalHistory.create({
    draftId: draft._id,
    draftRef: draft.draftId,
    action: 'SUBMITTED',
    performedBy: actor._id,
    comments: `Submitted via ${draft.sourceType}`,
    previousStatus: 'Incoming',
    newStatus: 'Pending TL Approval',
  });

  // Notify Team Leads / Admins
  const leads = await User.find({
    role: { $in: [ROLES.ADMIN, ROLES.TEAM_LEAD] },
    status: 'Active',
    isDeleted: false,
  })
    .select('_id')
    .lean();

  await notifyUsers({
    recipientIds: leads.map((l) => l._id),
    actorId: actor._id,
    type: 'ticket_updated',
    title: `Approval Needed: ${draft.draftId}`,
    message: `${actor.fullName} submitted AI ticket draft "${draft.generatedFields.title}" for TL approval.`,
    link: '/approvals',
    entityType: 'ticket',
    entityId: draft._id,
  });

  emitBroadcast('draft:changed', { action: 'submitted', draftId: draft._id });
  return TicketDraft.findById(draft._id)
    .populate('clientId', 'clientId companyName clientFolderCode pilotFolderCode productionFolderCode')
    .populate('submittedBy', 'fullName designation avatarColor')
    .populate('attachments');
}

/**
 * Approves a TicketDraft (with optional TL edits), atomically generates a permanent Ticket ID,
 * links attachments, creates selected suggested tasks, and logs ApprovalHistory.
 */
export async function approveTicketDraftService({ draftId, edits, selectedTaskIds, comments, actor }) {
  if (![ROLES.ADMIN, ROLES.TEAM_LEAD].includes(actor.role)) {
    throw new AppError('Only Team Leads or Administrators can approve ticket drafts.', 403);
  }

  // Atomic lock transition to prevent duplicate ticket creation on concurrent approvals
  const draft = await TicketDraft.findOne({ _id: draftId, isDeleted: false });
  if (!draft) throw new AppError('Ticket draft not found.', 404);
  if (draft.approvalStatus === 'Approved' && draft.approvedTicketId) {
    throw new AppError(`Draft already approved as ${draft.approvedTicketRef}.`, 409);
  }

  const targetClientId = edits?.clientId || draft.clientId;
  if (!targetClientId) {
    throw new AppError('A verified client must be selected before approving this ticket.', 400);
  }
  const client = await Client.findOne({ _id: targetClientId, isDeleted: false });
  if (!client) throw new AppError('Selected client does not exist.', 404);

  const prevStatus = draft.approvalStatus;
  const mergedFields = {
    ...draft.generatedFields.toObject(),
    ...(edits?.generatedFields || {}),
  };

  // Generate permanent Ticket ID only on approval (e.g., TKT-2026-00101)
  const year = new Date().getFullYear();
  const seqStr = await getNextSequence(`ticket_${year}`, `TKT-${year}`, 101);
  // Pad sequence cleanly to 5 digits if needed
  const parts = seqStr.split('-');
  const permanentTicketId = `TKT-${year}-${String(parts[parts.length - 1]).padStart(5, '0')}`;

  const priority = PRIORITIES.includes(mergedFields.priority) ? mergedFields.priority : 'Medium';
  const category = TICKET_CATEGORIES.includes(mergedFields.category) ? mergedFields.category : 'Support Request';
  const env = ['Development', 'Pilot', 'Production', 'UAT', 'Sandbox'].includes(mergedFields.environment)
    ? mergedFields.environment
    : 'Pilot';

  const slaHours = SLA_HOURS_BY_PRIORITY[priority] || client.slaResponseHours || 24;

  const ticket = await Ticket.create({
    ticketId: permanentTicketId,
    title: mergedFields.title || 'Approved Sage X3 Issue',
    description: mergedFields.description || draft.sourceText || draft.extractedText || 'Approved from AI intake.',
    client: client._id,
    category,
    priority,
    severity: SEVERITIES.includes(mergedFields.severity) ? mergedFields.severity : 'Minor',
    status: edits?.assignedDevelopers?.length > 0 ? 'Assigned' : 'New',
    reportedBy: draft.submittedBy ? 'Internal Intake' : 'Client',
    reportedByUser: draft.submittedBy,
    assignedDevelopers: edits?.assignedDevelopers || [],
    assignedTeamLead: actor._id,
    sageX3Environment: env,
    folderCode: mergedFields.folderCode || client.pilotFolderCode || client.clientFolderCode,
    slaDueAt: new Date(Date.now() + slaHours * 3600 * 1000),
    createdBy: actor._id,
    statusHistory: [
      {
        fromStatus: null,
        toStatus: edits?.assignedDevelopers?.length > 0 ? 'Assigned' : 'New',
        changedBy: actor._id,
        note: `Approved from ${draft.draftId}`,
      },
    ],
  });

  // Link draft attachments directly to the permanent ticket
  if (draft.attachments?.length > 0) {
    await Attachment.updateMany(
      { _id: { $in: draft.attachments } },
      { entityType: 'ticket', entityId: ticket._id }
    );
  }

  // Create accepted suggested tasks
  const tasksToCreate = (edits?.suggestedTasks || draft.suggestedTasks || []).filter((t) =>
    selectedTaskIds ? selectedTaskIds.includes(String(t._id)) : t.accepted !== false
  );

  for (const st of tasksToCreate) {
    const taskId = await getNextSequence('task', 'TSK', 1001);
    await Task.create({
      taskId,
      title: st.title,
      description: st.description || '',
      ticket: ticket._id,
      client: client._id,
      priority: PRIORITIES.includes(st.priority) ? st.priority : 'Medium',
      status: 'Todo',
      estimatedHours: st.estimatedHours || 2,
      createdBy: actor._id,
      statusHistory: [{ fromStatus: null, toStatus: 'Todo', changedBy: actor._id, note: 'Approved from AI suggestion' }],
    });
  }

  draft.clientId = client._id;
  draft.generatedFields = mergedFields;
  draft.approvalStatus = 'Approved';
  draft.reviewedBy = actor._id;
  draft.reviewedAt = new Date();
  draft.approvedTicketId = ticket._id;
  draft.approvedTicketRef = ticket.ticketId;
  await draft.save();

  const wasEdited = Boolean(edits && (edits.generatedFields || edits.clientId));
  await ApprovalHistory.create({
    draftId: draft._id,
    draftRef: draft.draftId,
    action: wasEdited ? 'EDITED_AND_APPROVED' : 'APPROVED',
    performedBy: actor._id,
    comments: comments || `Approved and published as ${ticket.ticketId}`,
    previousStatus: prevStatus,
    newStatus: 'Approved',
  });

  await recordActivity({
    actor: actor._id,
    action: 'TICKET_DRAFT_APPROVED',
    entityType: 'ticket',
    entityId: ticket._id,
    entityRef: ticket.ticketId,
    client: ticket.client,
    ticket: ticket._id,
    summary: `Approved draft ${draft.draftId} and published ${ticket.ticketId} (${tasksToCreate.length} task(s))`,
  });

  await notifyUsers({
    recipientIds: [draft.submittedBy, ...(edits?.assignedDevelopers || [])],
    actorId: actor._id,
    type: 'ticket_assigned',
    title: `Draft Approved → ${ticket.ticketId}`,
    message: `${actor.fullName} approved ${draft.draftId} and created ${ticket.ticketId}: "${ticket.title}".`,
    link: `/tickets/${ticket._id}`,
    entityType: 'ticket',
    entityId: ticket._id,
  });

  emitBroadcast('ticket:changed', { action: 'created', ticketId: ticket._id });
  emitBroadcast('draft:changed', { action: 'approved', draftId: draft._id });

  return { draft, ticket };
}

export async function rejectTicketDraftService({ draftId, reason, actor }) {
  if (![ROLES.ADMIN, ROLES.TEAM_LEAD].includes(actor.role)) {
    throw new AppError('Only Team Leads or Administrators can reject ticket drafts.', 403);
  }
  if (!reason || !reason.trim()) {
    throw new AppError('A rejection reason is required.', 400);
  }
  const draft = await TicketDraft.findOne({ _id: draftId, isDeleted: false });
  if (!draft) throw new AppError('Draft not found.', 404);
  if (draft.approvalStatus === 'Approved') {
    throw new AppError('Cannot reject an already approved draft.', 400);
  }

  const prev = draft.approvalStatus;
  draft.approvalStatus = 'Rejected';
  draft.rejectionReason = reason.trim();
  draft.reviewedBy = actor._id;
  draft.reviewedAt = new Date();
  await draft.save();

  await ApprovalHistory.create({
    draftId: draft._id,
    draftRef: draft.draftId,
    action: 'REJECTED',
    performedBy: actor._id,
    comments: reason.trim(),
    previousStatus: prev,
    newStatus: 'Rejected',
  });

  await notifyUsers({
    recipientIds: [draft.submittedBy],
    actorId: actor._id,
    type: 'ticket_updated',
    title: `Draft ${draft.draftId} Rejected`,
    message: `${actor.fullName} rejected your submission: ${reason.trim()}`,
    link: '/approvals',
    entityType: 'ticket',
    entityId: draft._id,
  });

  emitBroadcast('draft:changed', { action: 'rejected', draftId: draft._id });
  return draft;
}

export async function requestDraftChangesService({ draftId, comments, actor }) {
  if (![ROLES.ADMIN, ROLES.TEAM_LEAD].includes(actor.role)) {
    throw new AppError('Only Team Leads or Administrators can request changes.', 403);
  }
  if (!comments || !comments.trim()) {
    throw new AppError('Change request comments are required.', 400);
  }

  const draft = await TicketDraft.findOne({ _id: draftId, isDeleted: false });
  if (!draft) throw new AppError('Draft not found.', 404);

  const prev = draft.approvalStatus;
  draft.approvalStatus = 'Changes Requested';
  draft.changeRequestNotes = comments.trim();
  draft.reviewedBy = actor._id;
  draft.reviewedAt = new Date();
  await draft.save();

  await ApprovalHistory.create({
    draftId: draft._id,
    draftRef: draft.draftId,
    action: 'CHANGES_REQUESTED',
    performedBy: actor._id,
    comments: comments.trim(),
    previousStatus: prev,
    newStatus: 'Changes Requested',
  });

  await notifyUsers({
    recipientIds: [draft.submittedBy],
    actorId: actor._id,
    type: 'ticket_updated',
    title: `Changes Requested on ${draft.draftId}`,
    message: `${actor.fullName}: ${comments.trim()}`,
    link: '/approvals',
    entityType: 'ticket',
    entityId: draft._id,
  });

  emitBroadcast('draft:changed', { action: 'changes_requested', draftId: draft._id });
  return draft;
}

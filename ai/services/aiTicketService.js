import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import Client from '../../db/models/Client.js';
import User from '../../db/models/User.js';
import Ticket from '../../db/models/Ticket.js';
import Task from '../../db/models/Task.js';
import Attachment from '../../db/models/Attachment.js';
import TicketDraft from '../../db/models/TicketDraft.js';
import ApprovalHistory from '../../db/models/ApprovalHistory.js';
import { getNextSequence } from '../../db/models/Counter.js';
import { uploadRoot } from '../../backend/middleware/upload.js';
import {
  TICKET_CATEGORIES,
  PRIORITIES,
  SEVERITIES,
  DEPLOYMENT_ENVIRONMENTS,
  ROLES,
  SLA_HOURS_BY_PRIORITY,
} from '../../backend/config/constants.js';
import AppError from '../../backend/utils/AppError.js';
import { extractTextFromImage, sanitizeExtractedText } from './ocrService.js';
import { checkOllamaStatus, chatWithOllama, extractJsonFromText } from './ollamaService.js';
import { buildTicketExtractionPrompt } from './aiPromptService.js';
import { matchClientDeterministic } from './aiContextService.js';
import { recordActivity } from '../../backend/services/activityService.js';
import { notifyTicketStakeholders, notifyUsers, emitBroadcast } from '../../backend/services/notificationService.js';
import { recordAudit, recordAIActivity } from '../../backend/services/auditService.js';

const aiDraftOutputSchema = z.object({
  clientName: z.string().optional().default(''),
  folderCode: z.string().optional().default(''),
  environment: z.enum([...DEPLOYMENT_ENVIRONMENTS, 'UAT', 'Sandbox', 'Unknown']).catch('Unknown'),
  title: z.string().optional().default(''),
  shortDescription: z.string().optional().default(''),
  mediumDescription: z.string().optional().default(''),
  longDescription: z.string().optional().default(''),
  description: z.string().optional().default(''),
  category: z.enum(TICKET_CATEGORIES).catch('Support Request'),
  priority: z.enum(PRIORITIES).catch('Medium'),
  severity: z.enum(SEVERITIES).catch('Minor'),
  reportedIssue: z.string().optional().default(''),
  expectedBehavior: z.string().optional().default(''),
  actualBehavior: z.string().optional().default(''),
  suggestedTroubleshootingSteps: z.array(z.string()).catch([]),
  suggestedTasks: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().optional().default(''),
        priority: z.enum(PRIORITIES).catch('Medium'),
        estimatedHours: z.coerce.number().catch(2),
      })
    )
    .catch([]),
});

/**
 * Strips email headers, recipient lists, external-email CAUTION banners, greetings,
 * and email signatures so descriptions only contain the actual issue & technical context.
 */
function stripEmailNoise(raw = '') {
  if (!raw) return { subject: '', body: '' };
  let subject = '';
  const rawLines = String(raw).replace(/\r\n/g, '\n').split('\n');
  const cleanedLines = [];
  let inHeaderBlock = false;

  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i].trim();
    if (!line) {
      inHeaderBlock = false;
      continue;
    }

    // Extract Subject line for title/summary, then skip header
    const subjMatch = line.match(/^Subject:\s*(.*)$/i);
    if (subjMatch) {
      const val = subjMatch[1].replace(/^(RE|FW|FWD):\s*/i, '').trim();
      if (!subject && val) subject = val;
      inHeaderBlock = false;
      continue;
    }

    // Skip email header lines (From, Sent, Date, To, Cc, Bcc, Importance, Thread-*)
    if (/^(From|Sent|Date|To|Cc|Bcc|Importance|Thread-Topic|Thread-Index|Reply-To):/i.test(line)) {
      inHeaderBlock = true;
      continue;
    }

    // Skip signature_* tokens, contact/address/website/ticker lines, and bare recipient lines
    if (
      /^signature_[a-z0-9_]+$/i.test(line) ||
      /^(C|M|T|P|F|Tel|Mob|Phone|Fax|Email|E-mail)\s*:/i.test(line) ||
      /^(www\.|https?:\/\/)/i.test(line) ||
      /^(TSXV|NYSE|NASDAQ|OTCQB|FRA):/i.test(line) ||
      /^#\d+,\s+\d+.*\|/i.test(line)
    ) {
      continue;
    }
    if (
      inHeaderBlock ||
      /^[^:]{0,80}<[^>\s]+@[^>\s]+>[;,]?$/.test(line) ||
      /^[^.!?]{2,60}\([^)]+\)[;,]?$/.test(line)
    ) {
      if (line.endsWith(';') || line.endsWith(',') || /<[^>\s]+@[^>\s]+>/.test(line) || /^[^.!?]{2,60}\([^)]+\)$/.test(line)) {
        inHeaderBlock = true;
        continue;
      }
      inHeaderBlock = false;
    }

    // Skip external email CAUTION / confidentiality disclaimers
    if (
      /^CAUTION:\s*This email originated from outside/i.test(line) ||
      /Do not click links or open attachments unless you recognize/i.test(line) ||
      /this email and its attachments are confidential/i.test(line) ||
      /any unauthorized use or disclaimer is prohibited/i.test(line) ||
      /if you receive this email in error, please notify/i.test(line) ||
      /^EXTERNAL EMAIL:/i.test(line) ||
      /^\[OCR\s+[^\]]+\]:?$/i.test(line)
    ) {
      continue;
    }

    // Skip greetings and common signature/sign-off lines
    if (
      /^(@[\w,\s.-]+)?(good\s+(morning|afternoon|evening)|hi\b|hello\b|dear\b)/i.test(line) && line.length < 70 ||
      /^(thanks(\s*&\s*regards)?|best\s*regards|regards|sincerely|warm\s*regards|sent from my)/i.test(line) ||
      /\|.*(Head of|Manager|Director|Consultant|Lead|Engineer|CTP)/i.test(line)
    ) {
      continue;
    }

    cleanedLines.push(line);
  }

  return {
    subject,
    body: cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
  };
}

function buildCleanDescriptions({ title, body, clientName, environment, folderCode, category, steps = [] }) {
  const cleanBody = body || title || 'Sage X3 support request.';
  const sentences = cleanBody
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);

  const coreSummary = sentences.slice(0, 2).join(' ').slice(0, 220) || title;
  const scopeParts = [
    clientName ? `Client: ${clientName}` : null,
    environment && environment !== 'Unknown' ? `Env: ${environment}` : null,
    folderCode ? `Folder: ${folderCode}` : null,
    category ? `Category: ${category}` : null,
  ].filter(Boolean);
  const scopeLine = scopeParts.join(' · ');

  const shortDescription = scopeLine
    ? `${coreSummary} (${scopeParts.slice(0, 2).join(', ')}).`
    : coreSummary;

  const mediumBody = sentences.slice(0, 4).join(' ').slice(0, 650) || cleanBody.slice(0, 650);
  const mediumDescription = [
    `${title}: ${mediumBody}`,
    scopeLine ? `Scope: ${scopeLine}.` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const stepsBlock = steps.length > 0
    ? `\n\nRecommended Next Steps:\n${steps.map((s) => `- ${s}`).join('\n')}`
    : '';
  const longDescription = [
    `Summary:\n${title}`,
    scopeLine ? `Environment & Scope:\n${scopeLine}` : '',
    `Issue Details:\n${cleanBody.slice(0, 2400)}`,
  ]
    .filter(Boolean)
    .join('\n\n') + stepsBlock;

  return { shortDescription, mediumDescription, longDescription };
}

function deterministicDraftFallback(combinedText, clientMatch) {
  const { subject, body } = stripEmailNoise(combinedText);
  const cleanText = body || subject || combinedText;
  const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean);
  const firstLine = subject || lines[0] || 'Sage X3 Support Issue';
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

  const steps = [
    'Verify Sage X3 folder and reproduce in Pilot environment',
    'Check Syracuse / batch server / integration trace logs',
  ];

  const { shortDescription, mediumDescription, longDescription } = buildCleanDescriptions({
    title,
    body: cleanText,
    clientName: clientMatch.bestMatch?.companyName || '',
    environment,
    folderCode,
    category,
    steps,
  });

  return {
    clientName: clientMatch.bestMatch?.companyName || '',
    folderCode,
    environment,
    title,
    shortDescription,
    mediumDescription,
    longDescription,
    description: mediumDescription,
    category,
    priority,
    severity: priority === 'Critical' ? 'Critical' : 'Major',
    reportedIssue: firstLine,
    expectedBehavior: '',
    actualBehavior: cleanText.slice(0, 500),
    suggestedTroubleshootingSteps: steps,
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
  userView = '',
  clientIdOverride = null,
  files = [],
  actor,
}) {
  const sanitizedInput = sanitizeExtractedText(sourceText);
  const cleanUserView = sanitizeExtractedText(userView);
  const extractedParts = [];
  const attachmentDocs = [];

  for (const f of files) {
    const fileUrl = `/uploads/${f.filename}`;

    const att = await Attachment.create({
      entityType: 'ticket',
      entityId: actor._id, // Temporarily scoped until draft/ticket is linked
      originalName: f.originalname,
      filename: f.filename,
      mimeType: f.mimetype,
      size: f.size,
      url: fileUrl,
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

  // Also preserve raw text/email source as an attachment so the origin is always saved on the ticket
  if (sanitizedInput) {
    const srcFilename = `${Date.now()}-source-input.txt`;
    const srcPath = path.join(uploadRoot, srcFilename);
    const srcBuf = Buffer.from(sanitizedInput, 'utf8');
    fs.writeFileSync(srcPath, srcBuf);

    const srcUrl = `/uploads/${srcFilename}`;

    const srcAtt = await Attachment.create({
      entityType: 'ticket',
      entityId: actor._id,
      originalName: `${sourceType || 'intake'}-source.txt`,
      filename: srcFilename,
      mimeType: 'text/plain',
      size: srcBuf.length,
      url: srcUrl,
      uploadedBy: actor._id,
      isInternal: true,
    });
    attachmentDocs.push(srcAtt);
  }

  const ocrText = extractedParts.join('\n\n').trim();
  const combinedText = [cleanUserView, sanitizedInput, ocrText].filter(Boolean).join('\n\n').trim();

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

  const { subject: cleanedSubject, body: cleanedBody } = stripEmailNoise(
    [sanitizedInput, ocrText].filter(Boolean).join('\n\n')
  );
  const cleanForAi = [
    cleanUserView ? `=== 1. USER'S VIEW (WHAT THE ACTUAL JOB IS — HIGHEST PRIORITY) ===\n${cleanUserView}` : '',
    cleanedSubject ? `Subject: ${cleanedSubject}` : '',
    cleanedBody ? `=== 2. ISSUE / EMAIL & SCREENSHOT DETAILS ===\n${cleanedBody}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim() || combinedText;

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
          { role: 'user', content: `UNTRUSTED ISSUE CONTENT:\n"""\n${cleanForAi}\n"""` },
        ],
        expectJson: true,
        temperature: 0.1,
        timeoutMs: 180000,
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

  const isAutoApprover = (actor.role === ROLES.ADMIN || actor.role === ROLES.TEAM_LEAD) && Boolean(selectedClient);

  const cleanVariants = buildCleanDescriptions({
    title: structured.title || cleanedSubject || 'Sage X3 Issue Draft',
    body: [cleanUserView ? `Objective / User View: ${cleanUserView}` : '', cleanedBody].filter(Boolean).join('\n\n') || cleanForAi,
    clientName: selectedClient?.companyName || structured.clientName || '',
    environment: structured.environment || 'Pilot',
    folderCode: structured.folderCode || selectedClient?.pilotFolderCode || selectedClient?.clientFolderCode || '',
    category: structured.category || 'Support Request',
    steps: structured.suggestedTroubleshootingSteps || [],
  });

  const cleanField = (val) => stripEmailNoise(val || '').body;
  let shortDesc = cleanField(structured.shortDescription);
  let mediumDesc = cleanField(structured.mediumDescription) || cleanField(structured.description);
  let longDesc = cleanField(structured.longDescription);

  // If Ollama is online and any of the 3 descriptions is missing, run a focused AI revision pass
  if (ollamaStatus.available && ollamaStatus.modelReady && (!shortDesc || !mediumDesc || !longDesc)) {
    try {
      const revRes = await chatWithOllama({
        messages: [
          {
            role: 'system',
            content:
              'You are a technical writer for Sage X3 support tickets. Rewrite the provided User View, Issue Description, and Screenshot OCR text into 3 clean, professional ticket descriptions (NO email headers, NO From/To/Cc, NO CAUTION banners, NO raw OCR noise). Return ONLY valid JSON: {"shortDescription":"1-2 sentences","mediumDescription":"1 concise paragraph","longDescription":"detailed technical breakdown with scope, issue, and action items"}.',
          },
          { role: 'user', content: cleanForAi.slice(0, 4500) },
        ],
        expectJson: true,
        temperature: 0.2,
        timeoutMs: 180000,
      });
      const revJson = extractJsonFromText(revRes.content);
      if (revJson && typeof revJson === 'object') {
        if (!shortDesc && revJson.shortDescription) shortDesc = cleanField(revJson.shortDescription);
        if (!mediumDesc && revJson.mediumDescription) mediumDesc = cleanField(revJson.mediumDescription);
        if (!longDesc && revJson.longDescription) longDesc = cleanField(revJson.longDescription);
      }
    } catch (revErr) {
      console.warn('AI description revision skipped:', revErr.message);
    }
  }

  shortDesc = shortDesc || cleanVariants.shortDescription;
  mediumDesc = mediumDesc || cleanVariants.mediumDescription;
  longDesc = longDesc || cleanVariants.longDescription;

  const rawTitle = (structured.title || cleanedSubject || 'Sage X3 Issue Draft')
    .replace(/\s*[-–]\s*(IR|INC|REQ|REF)\s*#?\s*\d+[_\d-]*/gi, '')
    .trim();
  const finalTitle =
    cleanUserView && cleanUserView.length <= 60 && rawTitle.length > 55
      ? cleanUserView.charAt(0).toUpperCase() + cleanUserView.slice(1)
      : rawTitle || 'Sage X3 Issue Draft';

  const draftId = await getNextSequence('ticketDraft', 'DRF', 1001);
  const draft = await TicketDraft.create({
    draftId,
    sourceType: files.length > 0 ? (sourceType === 'chat' ? 'chat' : 'screenshot') : sourceType,
    sourceText: sanitizedInput,
    userView: cleanUserView,
    submittedBy: actor._id,
    clientId: selectedClient?._id || null,
    clientMatchConfidence: clientMatch.confidence,
    candidateClients: clientMatch.candidates,
    extractedText: ocrText,
    generatedFields: {
      title: finalTitle,
      shortDescription: shortDesc,
      mediumDescription: mediumDesc,
      longDescription: longDesc,
      description: mediumDesc,
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
    approvalStatus: isAutoApprover ? 'Approved' : 'Pending TL Approval',
    reviewedBy: isAutoApprover ? actor._id : null,
    reviewedAt: isAutoApprover ? new Date() : null,
  });

  if (isAutoApprover) {
    const year = new Date().getFullYear();
    const seqStr = await getNextSequence(`ticket_${year}`, `TKT-${year}`, 101);
    const parts = seqStr.split('-');
    const permanentTicketId = `TKT-${year}-${String(parts[parts.length - 1]).padStart(5, '0')}`;
    const priority = PRIORITIES.includes(structured.priority) ? structured.priority : 'Medium';
    const slaHours = SLA_HOURS_BY_PRIORITY[priority] || selectedClient.slaResponseHours || 24;

    const autoTicket = await Ticket.create({
      ticketId: permanentTicketId,
      title: draft.generatedFields.title,
      description: draft.generatedFields.description || 'Created via AI intake.',
      client: selectedClient._id,
      category: TICKET_CATEGORIES.includes(draft.generatedFields.category)
        ? draft.generatedFields.category
        : 'Support Request',
      priority,
      severity: SEVERITIES.includes(draft.generatedFields.severity) ? draft.generatedFields.severity : 'Minor',
      status: 'New',
      approvalStatus: 'APPROVED',
      approvalType: 'AUTO_APPROVED',
      approvedBy: actor._id,
      approvedAt: new Date(),
      sourceChannel: sourceType === 'chat' ? 'ai_chat' : 'smart_intake',
      reportedBy: 'Internal Intake',
      reportedByUser: actor._id,
      assignedDevelopers: [],
      assignedTeamLead: null,
      sageX3Environment: ['Development', 'Pilot', 'Production', 'UAT', 'Sandbox'].includes(draft.generatedFields.environment)
        ? draft.generatedFields.environment
        : 'Pilot',
      folderCode: draft.generatedFields.folderCode || selectedClient.clientFolderCode,
      slaDueAt: new Date(Date.now() + slaHours * 3600 * 1000),
      createdBy: actor._id,
      statusHistory: [
        {
          fromStatus: null,
          toStatus: 'New',
          changedBy: actor._id,
          note: `Auto-approved upon AI intake by ${actor.role}`,
        },
      ],
    });

    draft.approvedTicketId = autoTicket._id;
    draft.approvedTicketRef = autoTicket.ticketId;
    await draft.save();

    if (attachmentDocs.length > 0) {
      await Attachment.updateMany(
        { _id: { $in: attachmentDocs.map((a) => a._id) } },
        { entityType: 'ticket', entityId: autoTicket._id }
      );
    }

    await ApprovalHistory.create({
      draftId: draft._id,
      draftRef: draft.draftId,
      ticketId: autoTicket._id,
      ticketRef: autoTicket.ticketId,
      action: 'AUTO_APPROVED',
      performedBy: actor._id,
      creatorId: actor._id,
      approvalMode: 'AUTOMATIC',
      comments: `Auto-approved AI intake (${draft.draftId}) by ${actor.role}`,
      previousStatus: 'NONE',
      newStatus: 'APPROVED',
    });

    await recordAudit({
      actorId: actor._id,
      action: 'AI_TICKET_AUTO_APPROVED',
      recordType: 'Ticket',
      recordId: autoTicket._id,
      recordRef: autoTicket.ticketId,
      newValue: { draftId: draft.draftId, approvalStatus: 'APPROVED', unassigned: true },
      module: 'ai',
    });

    await notifyTicketStakeholders({
      ticket: autoTicket,
      actorId: actor._id,
      type: 'ticket_updated',
      title: `Ticket Created: ${autoTicket.ticketId}`,
      message: `${actor.fullName} created "${autoTicket.title}" via Smart Intake (no approval required).`,
      link: `/tickets/${autoTicket._id}`,
      includeActor: true,
    });

    emitBroadcast('ticket:changed', { action: 'created', ticketId: autoTicket._id });
  } else {
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
      creatorId: actor._id,
      approvalMode: 'MANUAL',
      comments: `Submitted via ${draft.sourceType}`,
      previousStatus: 'Incoming',
      newStatus: 'Pending TL Approval',
    });

    const leads = await User.find({
      role: { $in: [ROLES.ADMIN, ROLES.TEAM_LEAD] },
      status: 'Active',
      isDeleted: false,
    })
      .select('_id')
      .lean();

    await notifyTicketStakeholders({
      ticket: { _id: draft._id, ticketId: draft.draftId, createdBy: actor._id, assignedDevelopers: [], assignedTeamLead: null },
      actorId: actor._id,
      type: 'ticket_updated',
      title: `Approval Needed: ${draft.draftId}`,
      message: `${actor.fullName} submitted AI ticket draft "${draft.generatedFields.title}" for TL approval.`,
      link: `/approvals/drafts?draft=${draft._id}`,
      includeActor: false,
    });

    emitBroadcast('draft:changed', { action: 'submitted', draftId: draft._id });
  }

  return TicketDraft.findById(draft._id)
    .populate('clientId', 'clientId companyName clientFolderCode pilotFolderCode productionFolderCode')
    .populate('submittedBy', 'fullName designation avatarColor')
    .populate('attachments');
}

/**
 * Approves a TicketDraft (with optional TL edits), atomically generates a permanent Ticket ID,
 * keeps the approved ticket unassigned, links attachments, creates suggested tasks, and logs ApprovalHistory.
 */
export async function approveTicketDraftService({ draftId, edits, selectedTaskIds, comments, actor, effectivePermissions = null }) {
  const canApprove =
    actor.role === ROLES.ADMIN ||
    actor.role === ROLES.TEAM_LEAD ||
    effectivePermissions?.actions?.approval_inbox?.includes('approve') ||
    effectivePermissions?.actions?.tickets?.includes('approve');
  if (!canApprove) {
    throw new AppError('You do not have permission to approve ticket drafts.', 403);
  }

  // Concurrency-safe atomic claim so concurrent requests cannot publish duplicates
  const draft = await TicketDraft.findOneAndUpdate(
    { _id: draftId, isDeleted: false, approvedTicketId: null, approvalStatus: { $ne: 'Approved' } },
    { $set: { approvalStatus: 'AI Processing' } },
    { new: false }
  );
  if (!draft) {
    const existing = await TicketDraft.findById(draftId);
    if (existing?.approvedTicketRef) {
      throw new AppError(`Draft already approved as ${existing.approvedTicketRef}.`, 409);
    }
    throw new AppError('Ticket draft not found or currently being processed.', 404);
  }
  if (String(draft.submittedBy) === String(actor._id) && actor.role === ROLES.DEVELOPER) {
    await TicketDraft.updateOne({ _id: draftId }, { $set: { approvalStatus: draft.approvalStatus } });
    throw new AppError('Developers cannot self-approve their own drafts.', 403);
  }

  const targetClientId = edits?.clientId || draft.clientId;
  if (!targetClientId) {
    await TicketDraft.updateOne({ _id: draftId }, { $set: { approvalStatus: draft.approvalStatus } });
    throw new AppError('A verified client must be selected before approving this ticket.', 400);
  }
  const client = await Client.findOne({ _id: targetClientId, isDeleted: false });
  if (!client) {
    await TicketDraft.updateOne({ _id: draftId }, { $set: { approvalStatus: draft.approvalStatus } });
    throw new AppError('Selected client does not exist.', 404);
  }

  const prevStatus = draft.approvalStatus;
  const mergedFields = {
    ...draft.generatedFields.toObject(),
    ...(edits?.generatedFields || {}),
  };

  // Generate permanent Ticket ID only on approval (e.g., TKT-2026-00101)
  const year = new Date().getFullYear();
  const seqStr = await getNextSequence(`ticket_${year}`, `TKT-${year}`, 101);
  const parts = seqStr.split('-');
  const permanentTicketId = `TKT-${year}-${String(parts[parts.length - 1]).padStart(5, '0')}`;

  const priority = PRIORITIES.includes(mergedFields.priority) ? mergedFields.priority : 'Medium';
  const category = TICKET_CATEGORIES.includes(mergedFields.category) ? mergedFields.category : 'Support Request';
  const env = ['Development', 'Pilot', 'Production', 'UAT', 'Sandbox'].includes(mergedFields.environment)
    ? mergedFields.environment
    : 'Pilot';

  const slaHours = SLA_HOURS_BY_PRIORITY[priority] || client.slaResponseHours || 24;

  // Module 1.4: Approval leaves ticket unassigned
  const ticket = await Ticket.create({
    ticketId: permanentTicketId,
    title: mergedFields.title || 'Approved Sage X3 Issue',
    description: mergedFields.description || draft.sourceText || draft.extractedText || 'Approved from AI intake.',
    client: client._id,
    category,
    priority,
    severity: SEVERITIES.includes(mergedFields.severity) ? mergedFields.severity : 'Minor',
    status: 'New',
    approvalStatus: 'APPROVED',
    approvalType: 'MANUAL_APPROVED',
    approvedBy: actor._id,
    approvedAt: new Date(),
    sourceChannel: draft.sourceType === 'chat' ? 'ai_chat' : 'smart_intake',
    reportedBy: draft.submittedBy ? 'Internal Intake' : 'Client',
    reportedByUser: draft.submittedBy,
    assignedDevelopers: [],
    assignedTeamLead: null,
    sageX3Environment: env,
    folderCode: mergedFields.folderCode || client.pilotFolderCode || client.clientFolderCode,
    slaDueAt: new Date(Date.now() + slaHours * 3600 * 1000),
    createdBy: draft.submittedBy || actor._id,
    statusHistory: [
      {
        fromStatus: null,
        toStatus: 'New',
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
    ticketId: ticket._id,
    ticketRef: ticket.ticketId,
    action: wasEdited ? 'EDITED_AND_APPROVED' : 'APPROVED',
    performedBy: actor._id,
    creatorId: draft.submittedBy || actor._id,
    approvalMode: 'MANUAL',
    comments: comments || `Approved and published as ${ticket.ticketId}`,
    previousStatus: prevStatus,
    newStatus: 'Approved',
  });

  await recordAudit({
    actorId: actor._id,
    action: 'TICKET_DRAFT_APPROVED',
    recordType: 'Ticket',
    recordId: ticket._id,
    recordRef: ticket.ticketId,
    newValue: { draftId: draft.draftId, approvalStatus: 'APPROVED', unassigned: true },
    module: 'ai',
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

  await notifyTicketStakeholders({
    ticket,
    actorId: actor._id,
    type: 'ticket_assigned',
    title: `Ticket Approved: ${ticket.ticketId}`,
    message: `${actor.fullName} approved ${draft.draftId} and created ${ticket.ticketId}: "${ticket.title}".`,
    link: `/tickets/${ticket._id}`,
    includeActor: false,
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
    link: `/approvals/drafts?draft=${draft._id}&status=All`,
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
    link: `/approvals/drafts?draft=${draft._id}&status=All`,
    entityType: 'ticket',
    entityId: draft._id,
  });

  emitBroadcast('draft:changed', { action: 'changes_requested', draftId: draft._id });
  return draft;
}

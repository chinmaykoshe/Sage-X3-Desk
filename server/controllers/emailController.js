import EmailIntegration from '../models/EmailIntegration.js';
import EmailMessage from '../models/EmailMessage.js';
import EmailTicketLink from '../models/EmailTicketLink.js';
import EmailProcessingLog from '../models/EmailProcessingLog.js';
import Client from '../models/Client.js';
import Ticket from '../models/Ticket.js';
import Comment from '../models/Comment.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { decryptSecret, encryptSecret } from '../utils/secretVault.js';
import { getEmailProvider } from '../services/email/providerFactory.js';
import GmailProvider from '../services/email/GmailProvider.js';
import {
  createPendingTicketFromEmailDoc,
  processNormalizedEmail,
  syncMailboxNow,
} from '../services/email/emailProcessingService.js';
import { enqueueEmailJob } from '../services/email/emailScheduler.js';
import { recordAudit } from '../services/auditService.js';

function sanitizeIntegration(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete obj.encryptedCredentials;
  delete obj.clientStateToken;
  return obj;
}

// ==========================================
// ADMIN-ONLY SETUP & CONNECTION MANAGEMENT
// ==========================================

export const listIntegrations = asyncHandler(async (req, res) => {
  const list = await EmailIntegration.find({}).sort({ createdAt: -1 }).lean();
  return sendSuccess(res, list.map(sanitizeIntegration), 'Email integrations retrieved');
});

export const saveIntegration = asyncHandler(async (req, res) => {
  const {
    id,
    provider,
    mailboxAddress,
    displayName,
    publicConfig = {},
    credentials = {},
    automationRules,
  } = req.body;

  if (!provider || !['outlook', 'gmail'].includes(provider)) {
    throw new AppError('Provider must be "outlook" or "gmail".', 400);
  }
  if (!mailboxAddress) {
    throw new AppError('Mailbox address is required.', 400);
  }

  let doc = id
    ? await EmailIntegration.findById(id).select('+encryptedCredentials +clientStateToken')
    : await EmailIntegration.findOne({ provider, mailboxAddress: mailboxAddress.toLowerCase().trim() }).select(
        '+encryptedCredentials +clientStateToken'
      );

  const existingCreds = doc ? decryptSecret(doc.encryptedCredentials) : {};
  const cleanPublic = {
    tenantId: (publicConfig.tenantId || '').trim(),
    clientId: (publicConfig.clientId || '').trim(),
    projectId: (publicConfig.projectId || '').trim(),
    pubsubTopic: (publicConfig.pubsubTopic || '').trim(),
  };
  const mergedCreds = {
    ...existingCreds,
    ...(cleanPublic.tenantId ? { tenantId: cleanPublic.tenantId } : {}),
    ...(cleanPublic.clientId ? { clientId: cleanPublic.clientId } : {}),
    ...(credentials.clientSecret?.trim() ? { clientSecret: credentials.clientSecret.trim() } : {}),
    ...(credentials.refreshToken?.trim() ? { refreshToken: credentials.refreshToken.trim() } : {}),
    ...(credentials.accessToken?.trim() ? { accessToken: credentials.accessToken.trim() } : {}),
  };

  if (!doc) {
    doc = await EmailIntegration.create({
      provider,
      mailboxAddress: mailboxAddress.toLowerCase().trim(),
      displayName: displayName || mailboxAddress,
      publicConfig: cleanPublic,
      encryptedCredentials: encryptSecret(mergedCreds),
      hasClientSecret: Boolean(mergedCreds.clientSecret),
      hasOAuthTokens: Boolean(mergedCreds.accessToken || mergedCreds.refreshToken),
      automationRules: automationRules || {},
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
  } else {
    doc.displayName = displayName ?? doc.displayName;
    doc.publicConfig = { ...(doc.publicConfig?.toObject?.() || doc.publicConfig || {}), ...cleanPublic };
    doc.markModified('publicConfig');
    doc.encryptedCredentials = encryptSecret(mergedCreds);
    doc.hasClientSecret = Boolean(mergedCreds.clientSecret);
    doc.hasOAuthTokens = Boolean(mergedCreds.accessToken || mergedCreds.refreshToken);
    if (automationRules) {
      doc.automationRules = { ...(doc.automationRules?.toObject?.() || doc.automationRules || {}), ...automationRules };
      doc.markModified('automationRules');
    }
    doc.updatedBy = req.user._id;
    await doc.save();
  }

  await recordAudit({
    actor: req.user,
    action: 'EMAIL_INTEGRATION_SAVED',
    module: 'email_integration',
    entityType: 'EmailIntegration',
    entityId: doc._id,
    summary: `Saved ${doc.provider} mailbox configuration (${doc.mailboxAddress})`,
  });

  return sendSuccess(res, sanitizeIntegration(doc), 'Email integration saved securely');
});

export const testIntegration = asyncHandler(async (req, res) => {
  const doc = await EmailIntegration.findById(req.params.id).select('+encryptedCredentials +clientStateToken');
  if (!doc) throw new AppError('Email integration not found.', 404);
  try {
    const provider = getEmailProvider(doc);
    const result = await provider.testConnection();
    doc.connectionStatus = 'Connected';
    doc.lastError = '';
    await doc.save();
    return sendSuccess(res, { ...result, integration: sanitizeIntegration(doc) }, 'Mailbox connection verified');
  } catch (err) {
    doc.connectionStatus = 'Error';
    doc.lastError = err.message;
    await doc.save();
    throw err;
  }
});

export const syncIntegrationNow = asyncHandler(async (req, res) => {
  const doc = await EmailIntegration.findById(req.params.id).select('+encryptedCredentials +clientStateToken');
  if (!doc) throw new AppError('Email integration not found.', 404);
  try {
    const result = await syncMailboxNow(doc);
    return sendSuccess(res, { ...result, integration: sanitizeIntegration(doc) }, `Synced ${result.fetched} message(s)`);
  } catch (err) {
    doc.connectionStatus = 'Error';
    doc.lastError = err.message;
    await doc.save();
    throw err;
  }
});

export const syncAllMailboxes = asyncHandler(async (req, res) => {
  const integrations = await EmailIntegration.find({ isActive: true, connectionStatus: 'Connected' }).select(
    '+encryptedCredentials +clientStateToken'
  );
  if (integrations.length === 0) {
    throw new AppError('No connected Outlook or Gmail mailboxes found.', 400);
  }
  let totalFetched = 0;
  let totalProcessed = 0;
  const errors = [];
  for (const doc of integrations) {
    try {
      const r = await syncMailboxNow(doc);
      totalFetched += r.fetched;
      totalProcessed += r.processed;
    } catch (err) {
      errors.push(`${doc.mailboxAddress}: ${err.message}`);
    }
  }
  return sendSuccess(
    res,
    { fetched: totalFetched, processed: totalProcessed, errors },
    `Synced ${totalFetched} message(s) across ${integrations.length} mailbox(es)`
  );
});

export const renewIntegrationSubscription = asyncHandler(async (req, res) => {
  const doc = await EmailIntegration.findById(req.params.id).select('+encryptedCredentials +clientStateToken');
  if (!doc) throw new AppError('Email integration not found.', 404);
  const provider = getEmailProvider(doc);
  const webhookUrl = req.body.webhookUrl || `${req.protocol}://${req.get('host')}/api/email/webhooks/${doc.provider}`;
  const result = doc.subscriptionId
    ? await provider.renewSubscription()
    : await provider.registerNotifications(webhookUrl);
  return sendSuccess(res, { ...result, integration: sanitizeIntegration(doc) }, 'Subscription renewed');
});

export const disconnectIntegration = asyncHandler(async (req, res) => {
  const doc = await EmailIntegration.findById(req.params.id).select('+encryptedCredentials +clientStateToken');
  if (!doc) throw new AppError('Email integration not found.', 404);
  const provider = getEmailProvider(doc);
  await provider.disconnect();
  await recordAudit({
    actor: req.user,
    action: 'EMAIL_INTEGRATION_DISCONNECTED',
    module: 'email_integration',
    entityType: 'EmailIntegration',
    entityId: doc._id,
    summary: `Disconnected ${doc.provider} mailbox (${doc.mailboxAddress})`,
  });
  return sendSuccess(res, sanitizeIntegration(doc), 'Mailbox disconnected and credentials cleared');
});

export const deleteIntegration = asyncHandler(async (req, res) => {
  const doc = await EmailIntegration.findByIdAndDelete(req.params.id);
  if (!doc) throw new AppError('Email integration not found.', 404);
  return sendSuccess(res, null, 'Email integration removed');
});

export const getGmailAuthUrl = asyncHandler(async (req, res) => {
  const { integrationId, redirectUri: clientRedirectUri } = req.query;
  const doc = await EmailIntegration.findById(integrationId);
  if (!doc || doc.provider !== 'gmail') throw new AppError('Gmail integration not found.', 404);
  const redirectUri = clientRedirectUri || `${req.protocol}://${req.get('host')}/api/email/integrations/gmail/callback`;
  const url = GmailProvider.buildAuthUrl({
    clientId: doc.publicConfig?.clientId,
    redirectUri,
    state: String(doc._id),
  });
  return sendSuccess(res, { url, redirectUri }, 'Gmail OAuth URL generated');
});

export const exchangeGmailCode = asyncHandler(async (req, res) => {
  const { code, integrationId, redirectUri } = req.body;
  if (!code || !integrationId) throw new AppError('Missing OAuth code or integrationId.', 400);
  const doc = await EmailIntegration.findById(integrationId).select('+encryptedCredentials');
  if (!doc || doc.provider !== 'gmail') throw new AppError('Gmail integration not found.', 404);
  const provider = new GmailProvider(doc);
  await provider.exchangeAuthCode({ code, redirectUri });
  return sendSuccess(res, sanitizeIntegration(doc), 'Gmail authorized and connected');
});

export const gmailOAuthCallback = asyncHandler(async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) throw new AppError('Missing OAuth code or state.', 400);
  const doc = await EmailIntegration.findById(state).select('+encryptedCredentials');
  if (!doc || doc.provider !== 'gmail') throw new AppError('Gmail integration not found.', 404);
  const provider = new GmailProvider(doc);
  const redirectUri = `${req.protocol}://${req.get('host')}/api/email/integrations/gmail/callback`;
  await provider.exchangeAuthCode({ code, redirectUri });
  const clientRedirect = process.env.CLIENT_URL?.split(',')[0]?.trim() || 'http://localhost:5174';
  return res.redirect(`${clientRedirect}/settings?tab=integrations&gmail=connected`);
});

// ==========================================
// WEBHOOKS (ASYNC QUEUE + PROMPT ACK)
// ==========================================

export const outlookWebhook = asyncHandler(async (req, res) => {
  // Microsoft Graph subscription validation handshake
  if (req.query?.validationToken) {
    res.set('Content-Type', 'text/plain');
    return res.status(200).send(String(req.query.validationToken));
  }

  const notifications = Array.isArray(req.body?.value) ? req.body.value : [];
  for (const item of notifications) {
    if (!item.subscriptionId) continue;
    const integration = await EmailIntegration.findOne({
      provider: 'outlook',
      subscriptionId: item.subscriptionId,
      isActive: true,
    }).select('+clientStateToken');
    if (!integration) continue;
    if (integration.clientStateToken && item.clientState !== integration.clientStateToken) continue;

    await EmailProcessingLog.create({
      mailboxId: integration._id,
      processingStage: 'webhook_received',
      result: 'success',
      message: `Outlook notification queued (${item.changeType || 'created'})`,
    }).catch(() => {});

    enqueueEmailJob({ mailboxId: integration._id, provider: 'outlook', resourceData: item.resourceData });
  }

  return res.status(202).json({ received: true });
});

export const gmailWebhook = asyncHandler(async (req, res) => {
  const encoded = req.body?.message?.data;
  if (!encoded) return res.status(200).json({ received: true });

  let payload = {};
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    return res.status(400).json({ message: 'Invalid Pub/Sub payload' });
  }

  if (payload.emailAddress) {
    const integration = await EmailIntegration.findOne({
      provider: 'gmail',
      mailboxAddress: String(payload.emailAddress).toLowerCase().trim(),
      isActive: true,
    });
    if (integration) {
      await EmailProcessingLog.create({
        mailboxId: integration._id,
        processingStage: 'webhook_received',
        result: 'success',
        message: `Gmail Pub/Sub queued (historyId: ${payload.historyId || 'n/a'})`,
      }).catch(() => {});
      enqueueEmailJob({ mailboxId: integration._id, provider: 'gmail', historyId: payload.historyId });
    }
  }

  return res.status(200).json({ received: true });
});

// ==========================================
// ADMIN & TEAM LEAD EMAIL INBOX / REVIEW
// ==========================================

export const listEmailMessages = asyncHandler(async (req, res) => {
  const { status, provider, mailboxId, search } = req.query;
  const filter = {};
  if (status && status !== 'All') filter.processingStatus = status;
  if (provider) filter.provider = provider;
  if (mailboxId) filter.mailboxId = mailboxId;
  if (search) {
    filter.$or = [
      { subject: { $regex: search, $options: 'i' } },
      { 'sender.email': { $regex: search, $options: 'i' } },
      { plainBody: { $regex: search, $options: 'i' } },
    ];
  }

  const [messages, countsAgg, integrations, unconvertedCount] = await Promise.all([
    EmailMessage.find(filter)
      .populate('mailboxId', 'provider mailboxAddress displayName')
      .populate('matchedClientId', 'clientId companyName')
      .populate('relatedTicketId', 'ticketId title status approvalStatus')
      .populate('candidateTicketIds', 'ticketId title status')
      .sort({ receivedAt: -1 })
      .limit(100)
      .lean(),
    EmailMessage.aggregate([{ $group: { _id: '$processingStatus', count: { $sum: 1 } } }]),
    EmailIntegration.find({ isActive: true }).select('automationRules.autoCreateTickets').lean(),
    EmailMessage.countDocuments({ relatedTicketId: null, processingStatus: { $ne: 'Ignored' } }),
  ]);

  const counts = countsAgg.reduce((acc, r) => {
    acc[r._id] = r.count;
    return acc;
  }, {});

  const autoCreateTickets = integrations.some((i) => i.automationRules?.autoCreateTickets === true);

  return sendSuccess(res, { messages, counts, autoCreateTickets, unconvertedCount }, 'Email messages retrieved');
});

export const toggleAutoCreateTickets = asyncHandler(async (req, res) => {
  const { enabled, mode = 'next' } = req.body || {};
  const nextEnabled = Boolean(enabled);

  const integrations = await EmailIntegration.find({ isActive: true });
  for (const integ of integrations) {
    integ.automationRules = {
      ...(integ.automationRules?.toObject?.() || integ.automationRules || {}),
      autoCreateTickets: nextEnabled,
    };
    integ.markModified('automationRules');
    integ.updatedBy = req.user._id;
    await integ.save();
  }

  let createdCount = 0;
  let skippedCount = 0;

  if (nextEnabled && mode === 'existing') {
    const pendingEmails = await EmailMessage.find({
      relatedTicketId: null,
      processingStatus: { $ne: 'Ignored' },
    })
      .sort({ receivedAt: 1 })
      .limit(100);

    const integById = new Map(integrations.map((i) => [String(i._id), i]));
    const fallbackClient = await Client.findOne({ isDeleted: false, isActive: { $ne: false } }).lean();

    for (const emailDoc of pendingEmails) {
      let client = emailDoc.matchedClientId
        ? await Client.findOne({ _id: emailDoc.matchedClientId, isDeleted: false }).lean()
        : null;
      if (!client) client = fallbackClient;
      if (!client) {
        skippedCount += 1;
        continue;
      }
      const integ = integById.get(String(emailDoc.mailboxId)) || integrations[0];
      await createPendingTicketFromEmailDoc(emailDoc, client, integ, [], req.user);
      createdCount += 1;
    }
  }

  const msg = nextEnabled
    ? mode === 'existing'
      ? `Auto ticket creation enabled (${createdCount} existing email(s) converted to tickets${skippedCount ? `, ${skippedCount} skipped` : ''}).`
      : 'Auto ticket creation enabled starting from next incoming email.'
    : 'Auto ticket creation disabled. Tickets will only be created when you click Create Ticket.';

  return sendSuccess(res, { autoCreateTickets: nextEnabled, createdCount, skippedCount }, msg);
});

export const getEmailMessageDetail = asyncHandler(async (req, res) => {
  const msg = await EmailMessage.findById(req.params.id)
    .populate('mailboxId', 'provider mailboxAddress displayName')
    .populate('matchedClientId', 'clientId companyName clientFolderCode')
    .populate('relatedTicketId', 'ticketId title status approvalStatus')
    .populate('candidateTicketIds', 'ticketId title status')
    .populate('attachments')
    .lean();
  if (!msg) throw new AppError('Email message not found.', 404);
  const logs = await EmailProcessingLog.find({ emailMessageId: msg._id }).sort({ timestamp: -1 }).lean();
  return sendSuccess(res, { ...msg, logs }, 'Email details retrieved');
});

export const createTicketFromEmail = asyncHandler(async (req, res) => {
  const emailDoc = await EmailMessage.findById(req.params.id);
  if (!emailDoc) throw new AppError('Email message not found.', 404);
  if (emailDoc.relatedTicketId) throw new AppError('Email is already linked to a ticket.', 400);

  const clientId = req.body.clientId || emailDoc.matchedClientId;
  const client = clientId ? await Client.findById(clientId) : null;
  if (!client) throw new AppError('Select a client before creating a ticket from this email.', 400);

  const integration = await EmailIntegration.findById(emailDoc.mailboxId);
  const ticket = await createPendingTicketFromEmailDoc(emailDoc, client, integration, [], req.user);
  return sendSuccess(res, ticket, `Created pending ticket ${ticket.ticketId} for Admin/TL approval`, 201);
});

export const linkEmailToTicket = asyncHandler(async (req, res) => {
  const { ticketId } = req.body;
  const [emailDoc, ticket] = await Promise.all([
    EmailMessage.findById(req.params.id),
    Ticket.findById(ticketId),
  ]);
  if (!emailDoc) throw new AppError('Email message not found.', 404);
  if (!ticket) throw new AppError('Target ticket not found.', 404);

  await Comment.create({
    entityType: 'ticket',
    entityId: ticket._id,
    author: req.user._id,
    body: `[Linked Email from ${emailDoc.sender?.email} · ${new Date(emailDoc.receivedAt).toLocaleString()}]\nSubject: ${emailDoc.subject}\n\n${(emailDoc.plainBody || '').slice(0, 3000)}`,
    isInternal: false,
    attachments: emailDoc.attachments || [],
  });

  await EmailTicketLink.findOneAndUpdate(
    { emailMessageId: emailDoc._id, ticketId: ticket._id },
    { relationshipType: 'manual_link', matchMethod: 'manual', createdBy: req.user._id },
    { upsert: true }
  );

  emailDoc.relatedTicketId = ticket._id;
  emailDoc.matchedClientId = ticket.client;
  emailDoc.processingStatus = 'Processed';
  emailDoc.matchMethod = 'manual_link';
  emailDoc.matchRationale = `Manually linked to ${ticket.ticketId} by ${req.user.fullName}`;
  await emailDoc.save();

  return sendSuccess(res, emailDoc, `Linked email to ${ticket.ticketId}`);
});

export const retryEmailProcessing = asyncHandler(async (req, res) => {
  const emailDoc = await EmailMessage.findById(req.params.id);
  if (!emailDoc) throw new AppError('Email message not found.', 404);
  const integration = await EmailIntegration.findById(emailDoc.mailboxId).select('+encryptedCredentials +clientStateToken');
  if (!integration) throw new AppError('Mailbox integration not found.', 404);

  const provider = getEmailProvider(integration);
  const normalized = await provider.getMessageDetails(emailDoc.providerMessageId);
  emailDoc.processingStatus = 'Queued';
  emailDoc.errorMessage = '';
  await emailDoc.save();

  const updated = await processNormalizedEmail(integration, normalized);
  return sendSuccess(res, updated, 'Email reprocessed');
});

export const ignoreEmailMessage = asyncHandler(async (req, res) => {
  const emailDoc = await EmailMessage.findByIdAndUpdate(
    req.params.id,
    { processingStatus: 'Ignored', matchRationale: `Ignored by ${req.user.fullName}` },
    { new: true }
  );
  if (!emailDoc) throw new AppError('Email message not found.', 404);
  return sendSuccess(res, emailDoc, 'Email marked as ignored');
});

export const listEmailLogs = asyncHandler(async (req, res) => {
  const logs = await EmailProcessingLog.find({})
    .populate('mailboxId', 'provider mailboxAddress')
    .populate('emailMessageId', 'subject sender')
    .sort({ timestamp: -1 })
    .limit(100)
    .lean();
  return sendSuccess(res, logs, 'Email processing logs retrieved');
});

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  listIntegrations,
  saveIntegration,
  testIntegration,
  syncIntegrationNow,
  syncAllMailboxes,
  renewIntegrationSubscription,
  disconnectIntegration,
  deleteIntegration,
  getGmailAuthUrl,
  exchangeGmailCode,
  gmailOAuthCallback,
  outlookWebhook,
  gmailWebhook,
  listEmailMessages,
  getEmailMessageDetail,
  createTicketFromEmail,
  linkEmailToTicket,
  retryEmailProcessing,
  ignoreEmailMessage,
  listEmailLogs,
} from '../controllers/emailController.js';
import { protect, authorizeRoles } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// Public provider webhooks & OAuth callback (validated inside handlers)
router.post('/webhooks/outlook', webhookLimiter, outlookWebhook);
router.post('/webhooks/gmail', webhookLimiter, gmailWebhook);
router.get('/integrations/gmail/callback', gmailOAuthCallback);

router.use(protect);

// Admin-only setup & mailbox configuration
router.get('/integrations', authorizeRoles(ROLES.ADMIN), listIntegrations);
router.post('/integrations', authorizeRoles(ROLES.ADMIN), saveIntegration);
router.get('/integrations/gmail/auth-url', authorizeRoles(ROLES.ADMIN), getGmailAuthUrl);
router.post('/integrations/gmail/exchange', authorizeRoles(ROLES.ADMIN), exchangeGmailCode);
router.post('/integrations/:id/test', authorizeRoles(ROLES.ADMIN), testIntegration);
router.post('/integrations/:id/sync', authorizeRoles(ROLES.ADMIN), syncIntegrationNow);
router.post('/integrations/:id/renew', authorizeRoles(ROLES.ADMIN), renewIntegrationSubscription);
router.post('/integrations/:id/disconnect', authorizeRoles(ROLES.ADMIN), disconnectIntegration);
router.delete('/integrations/:id', authorizeRoles(ROLES.ADMIN), deleteIntegration);

// Email Inbox, Review & Logs (Admin & Team Lead)
router.post('/sync', authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), syncAllMailboxes);
router.get('/messages', authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), listEmailMessages);
router.get('/messages/:id', authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), getEmailMessageDetail);
router.post('/messages/:id/create-ticket', authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), createTicketFromEmail);
router.post('/messages/:id/link-ticket', authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), linkEmailToTicket);
router.post('/messages/:id/retry', authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), retryEmailProcessing);
router.post('/messages/:id/ignore', authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), ignoreEmailMessage);
router.get('/logs', authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), listEmailLogs);

export default router;

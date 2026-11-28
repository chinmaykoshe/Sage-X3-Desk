import { Router } from 'express';
import { isMongoConnected, getDbHealth } from '../../db/connection.js';
import { checkOllamaStatus } from '../../ai/services/ollamaService.js';
import { isMailerConfigured, getMailerStatus } from '../utils/email.js';
import { getEmailSchedulerStatus } from '../services/email/emailScheduler.js';
import EmailIntegration from '../../db/models/EmailIntegration.js';
import authRoutes from './authRoutes.js';
import clientRoutes from './clientRoutes.js';
import ticketRoutes from './ticketRoutes.js';
import taskRoutes from './taskRoutes.js';
import userRoutes from './userRoutes.js';
import projectRoutes from './projectRoutes.js';
import deploymentRoutes from './deploymentRoutes.js';
import commentRoutes from './commentRoutes.js';
import attachmentRoutes from './attachmentRoutes.js';
import timeLogRoutes from './timeLogRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import reportRoutes from './reportRoutes.js';
import activityRoutes from './activityRoutes.js';
import knowledgeBaseRoutes from './knowledgeBaseRoutes.js';
import settingsRoutes from './settingsRoutes.js';
import searchRoutes from './searchRoutes.js';
import savedViewRoutes from './savedViewRoutes.js';
import aiRoutes from './aiRoutes.js';
import rbacRoutes from './rbacRoutes.js';
import monitoringRoutes from './monitoringRoutes.js';
import emailRoutes from './emailRoutes.js';
import helpTicketRoutes from './helpTicketRoutes.js';

const router = Router();

router.get('/health', async (req, res) => {
  const mongoConnected = isMongoConnected();
  const dbHealth = getDbHealth();
  const [ollama, mailerConfigured, integrationsCount] = await Promise.all([
    checkOllamaStatus().catch((err) => ({ available: false, modelReady: false, error: err.message })),
    isMailerConfigured().catch(() => false),
    mongoConnected ? EmailIntegration.countDocuments({ isActive: true }).catch(() => 0) : Promise.resolve(0),
  ]);
  const mailerStatus = getMailerStatus();
  const scheduler = getEmailSchedulerStatus();

  res.status(mongoConnected ? 200 : 503).json({
    success: mongoConnected,
    message: mongoConnected ? 'Sage X3 Desk API is operational' : 'Local database unavailable',
    backend: {
      status: 'operational',
      runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-local',
      uptime: Math.floor(process.uptime()),
    },
    mongo: dbHealth,
    ollama,
    mailer: {
      configured: mailerConfigured,
      host: mailerStatus.host || '',
      hasPassword: Boolean(mailerStatus.hasPassword),
    },
    emailScheduler: {
      active: scheduler.active,
      queueLength: scheduler.queueLength,
      integrationsCount,
    },
    tailscale: {
      gatewayConfigured: Boolean(process.env.MONGO_GATEWAY_URL || process.env.AI_GATEWAY_URL),
      realtimeRelayConfigured: Boolean(process.env.REALTIME_GATEWAY_URL),
    },
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

router.use('/auth', authRoutes);
router.use('/clients', clientRoutes);
router.use('/tickets', ticketRoutes);
router.use('/tasks', taskRoutes);
router.use('/users', userRoutes);
router.use('/projects', projectRoutes);
router.use('/deployments', deploymentRoutes);
router.use('/comments', commentRoutes);
router.use('/attachments', attachmentRoutes);
router.use('/time-logs', timeLogRoutes);
router.use('/notifications', notificationRoutes);
router.use('/reports', reportRoutes);
router.use('/activity-logs', activityRoutes);
router.use('/knowledge-base', knowledgeBaseRoutes);
router.use('/settings', settingsRoutes);
router.use('/search', searchRoutes);
router.use('/views', savedViewRoutes);
router.use('/ai', aiRoutes);
router.use('/rbac', rbacRoutes);
router.use('/monitoring', monitoringRoutes);
router.use('/email', emailRoutes);
router.use('/help-tickets', helpTicketRoutes);

export default router;

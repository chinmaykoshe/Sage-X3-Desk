import { Router } from 'express';
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

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Sage X3 Desk API is operational', timestamp: new Date().toISOString() });
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

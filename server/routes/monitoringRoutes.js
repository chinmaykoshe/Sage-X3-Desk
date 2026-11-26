import { Router } from 'express';
import {
  getMonitoringOverview,
  getDevelopmentActivities,
  createDevelopmentActivity,
  getEmployeeUnifiedActivity,
  getSystemLogs,
  getApiMonitoringStats,
  getDeploymentHistory,
  getMonitoringTimeLogs,
  getAIActivityLogs,
  getAuditLogs,
  blockAuditMutation,
} from '../controllers/monitoringController.js';
import { protect, requireScreenAccess } from '../middleware/auth.js';

const router = Router();
router.use(protect);

// Any authorized developer/TL/Admin can log development activity against their work
router.route('/dev-activities')
  .get(requireScreenAccess('admin_dev_logs'), getDevelopmentActivities)
  .post(createDevelopmentActivity);

router.get('/overview', requireScreenAccess('admin_overview'), getMonitoringOverview);
router.get('/employee-activity/:employeeId', requireScreenAccess('admin_user_activity'), getEmployeeUnifiedActivity);
router.get('/system-logs', requireScreenAccess('admin_system_logs'), getSystemLogs);
router.get('/api-stats', requireScreenAccess('admin_api_monitoring'), getApiMonitoringStats);
router.get('/deployments', requireScreenAccess('admin_deployment_history'), getDeploymentHistory);
router.get('/time-logs', requireScreenAccess('admin_time_tracking'), getMonitoringTimeLogs);
router.get('/ai-logs', requireScreenAccess('admin_ai_activity'), getAIActivityLogs);
router.get('/audit-logs', requireScreenAccess('admin_audit_logs'), getAuditLogs);

// Enforce immutable audit log protection against application-level edits/deletes
router.put('/audit-logs/:id', blockAuditMutation);
router.patch('/audit-logs/:id', blockAuditMutation);
router.delete('/audit-logs/:id', blockAuditMutation);

export default router;

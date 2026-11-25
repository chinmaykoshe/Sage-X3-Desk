import { Router } from 'express';
import {
  getDashboardReport,
  getTicketsReport,
  getWorkloadReport,
  getTimeTrackingReport,
} from '../controllers/reportController.js';
import { protect, authorizePermission } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = Router();
router.use(protect);

router.get('/dashboard', getDashboardReport);
router.get('/tickets', authorizePermission('canViewReports', [ROLES.ADMIN, ROLES.TEAM_LEAD]), getTicketsReport);
router.get('/workload', authorizePermission('canViewReports', [ROLES.ADMIN, ROLES.TEAM_LEAD]), getWorkloadReport);
router.get('/time-tracking', authorizePermission('canViewReports', [ROLES.ADMIN, ROLES.TEAM_LEAD]), getTimeTrackingReport);

export default router;

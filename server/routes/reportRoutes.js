import { Router } from 'express';
import {
  getDashboardReport,
  getTicketsReport,
  getWorkloadReport,
  getTimeTrackingReport,
} from '../controllers/reportController.js';
import { protect, requireScreenAccess, requireActionPermission } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/dashboard', getDashboardReport);
router.get('/tickets', requireScreenAccess('reports'), requireActionPermission('reports', 'view', 'canViewReports'), getTicketsReport);
router.get('/workload', requireScreenAccess('reports'), requireActionPermission('reports', 'view', 'canViewReports'), getWorkloadReport);
router.get('/time-tracking', requireScreenAccess('reports'), requireActionPermission('reports', 'view', 'canViewReports'), getTimeTrackingReport);

export default router;

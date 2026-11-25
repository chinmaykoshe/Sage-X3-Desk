import { Router } from 'express';
import { getSettings, updateSettings, getBackupStatus, syncDualBackup } from '../controllers/settingsController.js';
import { protect, authorizeRoles } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = Router();
router.use(protect);

router.get('/', getSettings);
router.put('/', authorizeRoles(ROLES.ADMIN), updateSettings);
router.get('/backup-status', authorizeRoles(ROLES.ADMIN), getBackupStatus);
router.post('/backup-sync', authorizeRoles(ROLES.ADMIN), syncDualBackup);

export default router;

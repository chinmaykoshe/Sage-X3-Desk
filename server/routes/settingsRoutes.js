import { Router } from 'express';
import { getSettings, updateSettings } from '../controllers/settingsController.js';
import { protect, authorizeRoles } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = Router();
router.use(protect);

router.get('/', getSettings);
router.put('/', authorizeRoles(ROLES.ADMIN), updateSettings);

export default router;

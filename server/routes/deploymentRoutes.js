import { Router } from 'express';
import {
  getDeployments,
  createDeployment,
  updateDeploymentStatus,
  deleteDeployment,
} from '../controllers/deploymentController.js';
import { protect, authorizeRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { deploymentCreateSchema, deploymentStatusSchema } from '../validators/schemas.js';
import { ROLES } from '../config/constants.js';

const router = Router();
router.use(protect);

router.route('/').get(getDeployments).post(validate(deploymentCreateSchema), createDeployment);
router.patch('/:id/status', validate(deploymentStatusSchema), updateDeploymentStatus);
router.delete('/:id', authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), deleteDeployment);

export default router;

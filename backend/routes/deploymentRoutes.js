import { Router } from 'express';
import {
  getDeployments,
  createDeployment,
  updateDeploymentStatus,
  deleteDeployment,
} from '../controllers/deploymentController.js';
import { protect, requireActionPermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { deploymentCreateSchema, deploymentStatusSchema } from '../validators/schemas.js';

const router = Router();
router.use(protect);

router
  .route('/')
  .get(requireActionPermission('deployments', 'view'), getDeployments)
  .post(requireActionPermission('deployments', 'create'), validate(deploymentCreateSchema), createDeployment);
router.patch('/:id/status', requireActionPermission('deployments', 'edit'), validate(deploymentStatusSchema), updateDeploymentStatus);
router.delete('/:id', requireActionPermission('deployments', 'approve'), deleteDeployment);

export default router;

import { Router } from 'express';
import {
  getProjects,
  createProject,
  getProjectById,
  updateProject,
  deleteProject,
  addMilestone,
  updateMilestone,
} from '../controllers/projectController.js';
import { protect, authorizeRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { projectCreateSchema, projectUpdateSchema, milestoneSchema } from '../validators/schemas.js';
import { ROLES } from '../config/constants.js';

const router = Router();
router.use(protect);

router
  .route('/')
  .get(getProjects)
  .post(authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), validate(projectCreateSchema), createProject);

router
  .route('/:id')
  .get(getProjectById)
  .put(authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), validate(projectUpdateSchema), updateProject)
  .delete(authorizeRoles(ROLES.ADMIN), deleteProject);

router
  .route('/:id/milestones')
  .post(authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), validate(milestoneSchema), addMilestone);

router
  .route('/:id/milestones/:milestoneId')
  .put(authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), validate(milestoneSchema.partial()), updateMilestone);

export default router;

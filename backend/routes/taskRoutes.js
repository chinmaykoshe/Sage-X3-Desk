import { Router } from 'express';
import {
  getTasks,
  createTask,
  getTaskById,
  updateTask,
  updateTaskStatus,
  assignTask,
  reorderTask,
  bulkTaskAction,
  deleteTask,
} from '../controllers/taskController.js';
import { protect, authorizeRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  taskCreateSchema,
  taskUpdateSchema,
  taskStatusSchema,
  taskAssignSchema,
  reorderSchema,
  bulkActionSchema,
} from '../validators/schemas.js';
import { ROLES } from '../config/constants.js';

const router = Router();
router.use(protect);

router.route('/').get(getTasks).post(validate(taskCreateSchema), createTask);
router.patch('/reorder', validate(reorderSchema), reorderTask);
router.post('/bulk', validate(bulkActionSchema), bulkTaskAction);

router
  .route('/:id')
  .get(getTaskById)
  .put(validate(taskUpdateSchema), updateTask)
  .delete(authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), deleteTask);

router.patch('/:id/status', validate(taskStatusSchema), updateTaskStatus);
router.patch('/:id/assign', validate(taskAssignSchema), assignTask);

export default router;

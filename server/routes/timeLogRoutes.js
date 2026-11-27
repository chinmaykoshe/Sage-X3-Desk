import { Router } from 'express';
import { getTimeLogs, createTimeLog, updateTimeLog, deleteTimeLog } from '../controllers/timeLogController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { timeLogCreateSchema, timeLogUpdateSchema } from '../validators/schemas.js';

const router = Router();
router.use(protect);

router.route('/').get(getTimeLogs).post(validate(timeLogCreateSchema), createTimeLog);
router
  .route('/:id')
  .patch(validate(timeLogUpdateSchema), updateTimeLog)
  .delete(deleteTimeLog);

export default router;

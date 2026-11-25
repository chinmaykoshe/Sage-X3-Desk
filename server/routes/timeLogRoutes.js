import { Router } from 'express';
import { getTimeLogs, createTimeLog, deleteTimeLog } from '../controllers/timeLogController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { timeLogCreateSchema } from '../validators/schemas.js';

const router = Router();
router.use(protect);

router.route('/').get(getTimeLogs).post(validate(timeLogCreateSchema), createTimeLog);
router.delete('/:id', deleteTimeLog);

export default router;

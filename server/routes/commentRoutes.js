import { Router } from 'express';
import { getComments, createComment, updateComment, deleteComment } from '../controllers/commentController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { commentCreateSchema, commentUpdateSchema } from '../validators/schemas.js';

const router = Router();
router.use(protect);

router.route('/').get(getComments).post(validate(commentCreateSchema), createComment);
router.route('/:id').put(validate(commentUpdateSchema), updateComment).delete(deleteComment);

export default router;

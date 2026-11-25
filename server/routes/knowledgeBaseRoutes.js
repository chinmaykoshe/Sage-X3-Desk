import { Router } from 'express';
import { getArticles, createArticle, updateArticle, deleteArticle } from '../controllers/knowledgeBaseController.js';
import { protect, authorizeRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { knowledgeBaseSchema } from '../validators/schemas.js';
import { ROLES } from '../config/constants.js';

const router = Router();
router.use(protect);

router.route('/').get(getArticles).post(validate(knowledgeBaseSchema), createArticle);
router
  .route('/:id')
  .put(validate(knowledgeBaseSchema.partial()), updateArticle)
  .delete(authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), deleteArticle);

export default router;

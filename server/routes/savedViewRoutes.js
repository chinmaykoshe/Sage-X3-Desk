import { Router } from 'express';
import {
  getSavedViews,
  createSavedView,
  updateSavedView,
  duplicateSavedView,
  deleteSavedView,
} from '../controllers/savedViewController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { savedViewSchema } from '../validators/schemas.js';

const router = Router();
router.use(protect);

router.route('/').get(getSavedViews).post(validate(savedViewSchema), createSavedView);
router.route('/:id').put(validate(savedViewSchema.partial()), updateSavedView).delete(deleteSavedView);
router.post('/:id/duplicate', duplicateSavedView);

export default router;

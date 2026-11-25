import { Router } from 'express';
import { uploadAttachment, getAttachments, deleteAttachment } from '../controllers/attachmentController.js';
import { protect } from '../middleware/auth.js';
import { upload, enforceStorageLimit } from '../middleware/upload.js';

const router = Router();
router.use(protect);

router.route('/').get(getAttachments).post(enforceStorageLimit, upload.single('file'), uploadAttachment);
router.delete('/:id', deleteAttachment);

export default router;

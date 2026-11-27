import { Router } from 'express';
import {
  listHelpTickets,
  createHelpTicket,
  getHelpTicketById,
  updateHelpTicket,
  addHelpTicketComment,
  deleteHelpTicket,
} from '../controllers/helpTicketController.js';
import { protect } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();
router.use(protect);

router
  .route('/')
  .get(listHelpTickets)
  .post(upload.array('files', 5), createHelpTicket);

router
  .route('/:id')
  .get(getHelpTicketById)
  .patch(updateHelpTicket)
  .delete(deleteHelpTicket);

router.post('/:id/comments', upload.array('files', 5), addHelpTicketComment);

export default router;

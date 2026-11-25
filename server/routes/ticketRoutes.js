import { Router } from 'express';
import {
  getTickets,
  createTicket,
  getTicketById,
  updateTicket,
  updateTicketStatus,
  assignTicket,
  reorderTicket,
  duplicateTicket,
  bulkTicketAction,
  deleteTicket,
} from '../controllers/ticketController.js';
import { protect, authorizeRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  ticketCreateSchema,
  ticketUpdateSchema,
  ticketStatusSchema,
  ticketAssignSchema,
  reorderSchema,
  bulkActionSchema,
} from '../validators/schemas.js';
import { ROLES } from '../config/constants.js';

const router = Router();
router.use(protect);

router.route('/').get(getTickets).post(validate(ticketCreateSchema), createTicket);
router.patch('/reorder', validate(reorderSchema), reorderTicket);
router.post('/bulk', validate(bulkActionSchema), bulkTicketAction);

router
  .route('/:id')
  .get(getTicketById)
  .put(validate(ticketUpdateSchema), updateTicket)
  .delete(authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), deleteTicket);

router.patch('/:id/status', validate(ticketStatusSchema), updateTicketStatus);
router.patch('/:id/assign', validate(ticketAssignSchema), assignTicket);
router.post('/:id/duplicate', duplicateTicket);

export default router;

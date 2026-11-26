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
  getPendingApprovalTickets,
  approveTicket,
  rejectTicket,
  requestTicketChanges,
  getTicketApprovalHistory,
} from '../controllers/ticketController.js';
import { protect, requireActionPermission, requireScreenAccess } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  ticketCreateSchema,
  ticketUpdateSchema,
  ticketStatusSchema,
  ticketAssignSchema,
  reorderSchema,
  bulkActionSchema,
} from '../validators/schemas.js';

const router = Router();
router.use(protect);
router.use(requireScreenAccess('tickets'));

router
  .route('/')
  .get(requireActionPermission('tickets', 'view'), getTickets)
  .post(requireActionPermission('tickets', 'create'), validate(ticketCreateSchema), createTicket);
router.get('/pending-approval', getPendingApprovalTickets);
router.patch('/reorder', requireActionPermission('tickets', 'change_status'), validate(reorderSchema), reorderTicket);
router.post('/bulk', requireActionPermission('tickets', 'edit'), validate(bulkActionSchema), bulkTicketAction);

router
  .route('/:id')
  .get(requireActionPermission('tickets', 'view'), getTicketById)
  .put(requireActionPermission('tickets', 'edit'), validate(ticketUpdateSchema), updateTicket)
  .delete(requireActionPermission('tickets', 'delete'), deleteTicket);

router.patch('/:id/status', requireActionPermission('tickets', 'change_status'), validate(ticketStatusSchema), updateTicketStatus);
router.patch('/:id/assign', requireActionPermission('tickets', 'assign', 'canAssignTickets'), validate(ticketAssignSchema), assignTicket);
router.post('/:id/duplicate', requireActionPermission('tickets', 'create'), duplicateTicket);
router.post('/:id/approve', requireActionPermission('tickets', 'approve'), approveTicket);
router.post('/:id/reject', requireActionPermission('tickets', 'reject'), rejectTicket);
router.post('/:id/request-changes', requireActionPermission('tickets', 'request_changes'), requestTicketChanges);
router.get('/:id/approval-history', requireActionPermission('tickets', 'view_history'), getTicketApprovalHistory);

export default router;

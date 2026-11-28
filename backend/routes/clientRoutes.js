import { Router } from 'express';
import {
  getClients,
  createClient,
  getClientById,
  updateClient,
  deleteClient,
  addClientEnvironment,
  deleteClientEnvironment,
} from '../controllers/clientController.js';
import { protect, requireActionPermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { clientSchema, environmentSchema } from '../validators/schemas.js';

const router = Router();
router.use(protect);

router
  .route('/')
  .get(requireActionPermission('clients', 'view'), getClients)
  .post(requireActionPermission('clients', 'create', 'canManageClients'), validate(clientSchema), createClient);

router
  .route('/:id')
  .get(requireActionPermission('clients', 'view'), getClientById)
  .put(requireActionPermission('clients', 'edit', 'canManageClients'), validate(clientSchema.partial()), updateClient)
  .delete(requireActionPermission('clients', 'delete'), deleteClient);

router
  .route('/:id/environments')
  .post(requireActionPermission('clients', 'edit', 'canManageClients'), validate(environmentSchema), addClientEnvironment);

router
  .route('/:id/environments/:envId')
  .delete(requireActionPermission('clients', 'edit', 'canManageClients'), deleteClientEnvironment);

export default router;

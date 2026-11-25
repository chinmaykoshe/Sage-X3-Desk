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
import { protect, authorizePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { clientSchema, environmentSchema } from '../validators/schemas.js';
import { ROLES } from '../config/constants.js';

const router = Router();
router.use(protect);

router
  .route('/')
  .get(getClients)
  .post(authorizePermission('canManageClients', [ROLES.ADMIN, ROLES.TEAM_LEAD]), validate(clientSchema), createClient);

router
  .route('/:id')
  .get(getClientById)
  .put(authorizePermission('canManageClients', [ROLES.ADMIN, ROLES.TEAM_LEAD]), validate(clientSchema.partial()), updateClient)
  .delete(authorizePermission('canManageClients', [ROLES.ADMIN]), deleteClient);

router
  .route('/:id/environments')
  .post(authorizePermission('canManageClients', [ROLES.ADMIN, ROLES.TEAM_LEAD]), validate(environmentSchema), addClientEnvironment);

router
  .route('/:id/environments/:envId')
  .delete(authorizePermission('canManageClients', [ROLES.ADMIN, ROLES.TEAM_LEAD]), deleteClientEnvironment);

export default router;

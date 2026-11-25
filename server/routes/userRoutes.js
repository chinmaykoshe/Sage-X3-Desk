import { Router } from 'express';
import { getUsers, createUser, getUserById, updateUser, deleteUser } from '../controllers/userController.js';
import { protect, authorizeRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { userCreateSchema, userUpdateSchema } from '../validators/schemas.js';
import { ROLES } from '../config/constants.js';

const router = Router();
router.use(protect);

router
  .route('/')
  .get(getUsers)
  .post(authorizeRoles(ROLES.ADMIN), validate(userCreateSchema), createUser);

router
  .route('/:id')
  .get(getUserById)
  .put(authorizeRoles(ROLES.ADMIN), validate(userUpdateSchema), updateUser)
  .delete(authorizeRoles(ROLES.ADMIN), deleteUser);

export default router;

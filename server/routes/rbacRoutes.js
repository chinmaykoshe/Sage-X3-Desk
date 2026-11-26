import { Router } from 'express';
import {
  getMyPermissions,
  getScreenRegistry,
  updateRegisteredScreen,
  getPermissionGroups,
  createPermissionGroup,
  updatePermissionGroup,
  deletePermissionGroup,
  getUserPermissionsDetail,
  updateUserPermissions,
  copyUserPermissions,
} from '../controllers/rbacController.js';
import { protect, authorizeRoles } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = Router();
router.use(protect);

router.get('/my-permissions', getMyPermissions);
router.get('/screens', getScreenRegistry);
router.put('/screens/:key', authorizeRoles(ROLES.ADMIN), updateRegisteredScreen);

router.route('/groups')
  .get(authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), getPermissionGroups)
  .post(authorizeRoles(ROLES.ADMIN), createPermissionGroup);
router.route('/groups/:id')
  .put(authorizeRoles(ROLES.ADMIN), updatePermissionGroup)
  .delete(authorizeRoles(ROLES.ADMIN), deletePermissionGroup);

router.route('/users/:userId')
  .get(authorizeRoles(ROLES.ADMIN), getUserPermissionsDetail)
  .put(authorizeRoles(ROLES.ADMIN), updateUserPermissions);
router.post('/users/:userId/copy-from/:sourceUserId', authorizeRoles(ROLES.ADMIN), copyUserPermissions);

export default router;

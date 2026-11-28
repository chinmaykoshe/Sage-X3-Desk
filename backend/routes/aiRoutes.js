import { Router } from 'express';
import {
  getAiStatus,
  getConversations,
  createConversation,
  deleteConversation,
  aiChat,
  smartIntakeCreateDraft,
  getDrafts,
  getDraftById,
  updateDraft,
  approveDraft,
  rejectDraft,
  requestDraftChanges,
  getActionRequests,
  updateActionRequest,
  approveActionRequest,
  rejectActionRequest,
} from '../controllers/aiController.js';
import { protect, authorizeRoles, requireActionPermission } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { ROLES } from '../config/constants.js';

const router = Router();
router.use(protect);

router.get('/status', getAiStatus);
router.route('/conversations').get(getConversations).post(createConversation);
router.delete('/conversations/:id', deleteConversation);

router.post('/chat', upload.array('files', 5), aiChat);
router.post('/intake', upload.array('files', 5), smartIntakeCreateDraft);

router.get('/drafts', getDrafts);
router.route('/drafts/:id').get(getDraftById).put(updateDraft);
router.post('/drafts/:id/approve', requireActionPermission('approval_inbox', 'approve'), approveDraft);
router.post('/drafts/:id/reject', requireActionPermission('approval_inbox', 'reject'), rejectDraft);
router.post('/drafts/:id/request-changes', requireActionPermission('approval_inbox', 'request_changes'), requestDraftChanges);

router.get('/action-requests', getActionRequests);
router.put('/action-requests/:id', updateActionRequest);
router.post('/action-requests/:id/approve', authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), approveActionRequest);
router.post('/action-requests/:id/reject', authorizeRoles(ROLES.ADMIN, ROLES.TEAM_LEAD), rejectActionRequest);

export default router;

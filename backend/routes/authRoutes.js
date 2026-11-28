import { Router } from 'express';
import {
  login,
  register,
  logout,
  getMe,
  updateProfile,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  adminListResetRequests,
  adminSendReset,
  adminSendResetForUser,
  adminRejectReset,
} from '../controllers/authController.js';
import { protect, authorizeRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} from '../validators/schemas.js';
import { ROLES } from '../config/constants.js';

const router = Router();

// ─── Public ───────────────────────────────────────────────────────────────────
router.post('/login', validate(loginSchema), login);
router.post('/register', validate(registerSchema), register);
router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);
router.post('/verify-email', validate(verifyEmailSchema), verifyEmail);
router.post('/resend-verification', validate(resendVerificationSchema), resendVerification);

// ─── Protected ────────────────────────────────────────────────────────────────
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);

// ─── Admin-only: Password Reset Management ────────────────────────────────────
router.get('/admin/reset-requests', protect, authorizeRoles(ROLES.ADMIN), adminListResetRequests);
router.post('/admin/send-reset/:requestId', protect, authorizeRoles(ROLES.ADMIN), adminSendReset);
router.post('/admin/send-reset-user/:userId', protect, authorizeRoles(ROLES.ADMIN), adminSendResetForUser);
router.post('/admin/reject-reset/:requestId', protect, authorizeRoles(ROLES.ADMIN), adminRejectReset);

export default router;

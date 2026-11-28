import mongoose from 'mongoose';

const passwordResetRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    reason: { type: String, default: '', trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ['PENDING_ADMIN', 'LINK_SENT', 'COMPLETED', 'REJECTED', 'EXPIRED'],
      default: 'PENDING_ADMIN',
      index: true,
    },
    resetTokenHash: { type: String, default: '' },
    verificationCodeHash: { type: String, default: '' },
    expiresAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    adminNote: { type: String, default: '', trim: true, maxlength: 500 },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sentAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    mailDelivery: {
      sent: { type: Boolean, default: false },
      provider: { type: String, default: '' },
      reason: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

const PasswordResetRequest = mongoose.model('PasswordResetRequest', passwordResetRequestSchema);
export default PasswordResetRequest;

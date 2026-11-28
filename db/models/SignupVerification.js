import mongoose from 'mongoose';

const signupVerificationSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    codeHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const SignupVerification = mongoose.model('SignupVerification', signupVerificationSchema);
export default SignupVerification;

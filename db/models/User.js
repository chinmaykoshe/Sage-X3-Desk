import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES } from '../../backend/config/constants.js';

const userSchema = new mongoose.Schema(
  {
    employeeId: { type: String, unique: true, index: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true, select: false },
    contactNumber: { type: String, default: '' },
    designation: { type: String, default: 'Sage X3 Consultant' },
    department: { type: String, default: 'Sage X3 Practice' },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.DEVELOPER,
      index: true,
    },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
    clientRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    joiningDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['Pending', 'Active', 'Inactive', 'On Leave'], default: 'Active', index: true },
    emailVerified: { type: Boolean, default: false },
    skills: [{ type: String, trim: true }],
    avatarColor: { type: String, default: '#2563eb' },
    permissions: {
      canAssignTickets: { type: Boolean, default: false },
      canApproveDeployments: { type: Boolean, default: false },
      canManageClients: { type: Boolean, default: false },
      canViewReports: { type: Boolean, default: false },
      canWaiveTicketClose: { type: Boolean, default: false },
    },
    preferences: {
      theme: { type: String, enum: ['light', 'dark'], default: 'light' },
      emailNotifications: { type: Boolean, default: true },
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

const User = mongoose.model('User', userSchema);
export default User;

import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, default: '' },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    specialization: { type: String, default: 'Sage X3 Development & Support' },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Team = mongoose.model('Team', teamSchema);
export default Team;

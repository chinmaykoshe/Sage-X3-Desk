import mongoose from 'mongoose';

const milestoneSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    dueDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Completed', 'Delayed'],
      default: 'Pending',
    },
    completedAt: { type: Date, default: null },
    order: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Milestone = mongoose.model('Milestone', milestoneSchema);
export default Milestone;

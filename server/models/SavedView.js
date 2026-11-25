import mongoose from 'mongoose';

const savedViewSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    entityType: { type: String, enum: ['ticket', 'task'], required: true, index: true },
    viewMode: {
      type: String,
      enum: ['board', 'list', 'calendar', 'timeline', 'workload'],
      default: 'board',
    },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    isShared: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false },
    config: {
      groupBy: { type: String, default: 'status' },
      sortBy: { type: String, default: 'sortOrder' },
      sortOrder: { type: String, default: 'asc' },
      filters: { type: mongoose.Schema.Types.Mixed, default: {} },
      hiddenColumns: [{ type: String }],
      visibleFields: [{ type: String }],
      hideEmptyColumns: { type: Boolean, default: false },
    },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const SavedView = mongoose.model('SavedView', savedViewSchema);
export default SavedView;

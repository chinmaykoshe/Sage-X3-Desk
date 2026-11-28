import mongoose from 'mongoose';

const systemLogSchema = new mongoose.Schema(
  {
    severity: {
      type: String,
      enum: ['info', 'warn', 'error', 'critical', 'security'],
      default: 'error',
      index: true,
    },
    category: {
      type: String,
      enum: ['api_error', 'validation', 'auth_failure', 'database', 'ollama_ai', 'infrastructure', 'job', 'application'],
      default: 'application',
      index: true,
    },
    endpoint: { type: String, default: '', index: true },
    method: { type: String, default: '' },
    httpStatus: { type: Number, default: 500, index: true },
    durationMs: { type: Number, default: 0 },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    relatedRecord: { type: String, default: '' },
    module: { type: String, default: 'system', index: true },
    message: { type: String, required: true },
    stackTrace: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Automatic retention cleanup (30 days) to prevent excessive log accumulation
systemLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

const SystemLog = mongoose.model('SystemLog', systemLogSchema);
export default SystemLog;

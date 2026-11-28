import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    action: { type: String, required: true, index: true },
    recordType: { type: String, required: true, index: true },
    recordId: { type: String, default: '', index: true },
    recordRef: { type: String, default: '' },
    previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    module: { type: String, required: true, index: true },
    result: { type: String, enum: ['SUCCESS', 'DENIED', 'FAILED'], default: 'SUCCESS', index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

function blockImmutableMutation(next) {
  next(new Error('AuditLog records are immutable and append-only.'));
}

auditLogSchema.pre('updateOne', blockImmutableMutation);
auditLogSchema.pre('updateMany', blockImmutableMutation);
auditLogSchema.pre('findOneAndUpdate', blockImmutableMutation);
auditLogSchema.pre('deleteOne', blockImmutableMutation);
auditLogSchema.pre('deleteMany', blockImmutableMutation);
auditLogSchema.pre('findOneAndDelete', blockImmutableMutation);

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;

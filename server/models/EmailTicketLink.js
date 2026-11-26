import mongoose from 'mongoose';

const emailTicketLinkSchema = new mongoose.Schema(
  {
    emailMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailMessage',
      required: true,
      index: true,
    },
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
      required: true,
      index: true,
    },
    relationshipType: {
      type: String,
      enum: ['created', 'reply', 'manual_link'],
      default: 'created',
    },
    matchMethod: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

emailTicketLinkSchema.index({ emailMessageId: 1, ticketId: 1 }, { unique: true });

const EmailTicketLink = mongoose.model('EmailTicketLink', emailTicketLinkSchema);
export default EmailTicketLink;

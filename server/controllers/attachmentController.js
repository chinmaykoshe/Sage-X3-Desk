import Attachment from '../models/Attachment.js';
import Ticket from '../models/Ticket.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { recordActivity } from '../services/activityService.js';

export const uploadAttachment = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('No file provided.', 400);
  }
  const { entityType = 'ticket', entityId, isInternal = 'true' } = req.body;
  if (!entityId) {
    throw new AppError('entityId is required for file attachment.', 400);
  }

  const attachment = await Attachment.create({
    entityType,
    entityId,
    originalName: req.file.originalname,
    filename: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    url: `/uploads/${req.file.filename}`,
    uploadedBy: req.user._id,
    isInternal: isInternal !== 'false',
  });

  let client = entityType === 'client' ? entityId : null;
  let ticket = entityType === 'ticket' ? entityId : null;
  if (ticket) {
    const t = await Ticket.findById(ticket).select('client ticketId');
    if (t) client = t.client;
  }

  await recordActivity({
    actor: req.user._id,
    action: 'ATTACHMENT_UPLOADED',
    entityType,
    entityId,
    client,
    ticket,
    summary: `Uploaded file "${req.file.originalname}"`,
  });

  const populated = await Attachment.findById(attachment._id).populate('uploadedBy', 'fullName');
  return sendSuccess(res, populated, 'File uploaded successfully', 201);
});

export const getAttachments = asyncHandler(async (req, res) => {
  const { entityType, entityId } = req.query;
  const filter = { isDeleted: false };
  if (entityType) filter.entityType = entityType;
  if (entityId) filter.entityId = entityId;

  const files = await Attachment.find(filter)
    .populate('uploadedBy', 'fullName')
    .sort({ createdAt: -1 })
    .lean();
  return sendSuccess(res, files, 'Attachments retrieved');
});

export const deleteAttachment = asyncHandler(async (req, res) => {
  const att = await Attachment.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { isDeleted: true },
    { new: true }
  );
  if (!att) throw new AppError('Attachment not found.', 404);
  return sendSuccess(res, null, 'Attachment removed');
});

import HelpTicket from '../../db/models/HelpTicket.js';
import User from '../../db/models/User.js';
import { getNextSequence } from '../../db/models/Counter.js';
import { ROLES } from '../config/constants.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { createNotification, emitBroadcast } from '../services/notificationService.js';
import { recordActivity } from '../services/activityService.js';

function mapUploadedFiles(files = []) {
  return (files || []).map((f) => ({
    filename: f.filename,
    originalName: f.originalname || f.filename,
    mimeType: f.mimetype || 'application/octet-stream',
    size: f.size || 0,
    url: `/uploads/${f.filename}`,
  }));
}

export const listHelpTickets = asyncHandler(async (req, res) => {
  const { status, severity, category, search } = req.query;
  const isAdmin = req.user.role === ROLES.ADMIN;

  const baseScope = { isDeleted: false };
  if (!isAdmin) {
    baseScope.submittedBy = req.user._id;
  }

  const filter = { ...baseScope };
  if (status && status !== 'All') filter.status = status;
  if (severity && severity !== 'All') filter.severity = severity;
  if (category && category !== 'All') filter.category = category;
  if (search && search.trim()) {
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ helpTicketId: rx }, { title: rx }, { description: rx }, { pageUrl: rx }];
  }

  const [tickets, countsAgg] = await Promise.all([
    HelpTicket.find(filter)
      .populate('submittedBy', 'fullName employeeId email role avatarColor')
      .populate('resolvedBy', 'fullName employeeId')
      .populate('comments.author', 'fullName role avatarColor')
      .sort({ createdAt: -1 })
      .limit(150)
      .lean(),
    HelpTicket.aggregate([
      { $match: baseScope },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const counts = countsAgg.reduce((acc, r) => {
    acc[r._id] = r.count;
    return acc;
  }, {});

  return sendSuccess(res, { tickets, counts }, 'Help center tickets retrieved');
});

export const createHelpTicket = asyncHandler(async (req, res) => {
  const { title, description, category, severity, pageUrl = '', browserInfo = '' } = req.body;
  if (!title || String(title).trim().length < 3) {
    throw new AppError('Issue title is required (minimum 3 characters).', 400);
  }
  if (!description || String(description).trim().length < 5) {
    throw new AppError('Please describe the software issue (minimum 5 characters).', 400);
  }

  const helpTicketId = await getNextSequence('help_ticket', 'HLP', 101);
  const attachments = mapUploadedFiles(req.files);

  const ticket = await HelpTicket.create({
    helpTicketId,
    submittedBy: req.user._id,
    title: String(title).trim(),
    description: String(description).trim(),
    category: category || 'UI / Layout Bug',
    severity: severity || 'Medium',
    pageUrl: String(pageUrl || '').trim(),
    browserInfo: String(browserInfo || '').trim(),
    attachments,
    status: 'Open',
  });

  // Notify all active administrators in Inbox
  const admins = await User.find({
    role: ROLES.ADMIN,
    isDeleted: false,
    status: { $ne: 'Inactive' },
    _id: { $ne: req.user._id },
  })
    .select('_id')
    .lean();

  await Promise.all([
    ...admins.map((adm) =>
      createNotification({
        recipient: adm._id,
        actor: req.user._id,
        type: 'ticket_assigned',
        title: `Software Issue ${helpTicketId}: ${ticket.title}`,
        message: `${req.user.fullName} reported a ${ticket.severity} ${ticket.category} issue for Admin review.`,
        link: `/help-center?ticket=${ticket._id}`,
        entityType: 'help_ticket',
        entityId: ticket._id,
      })
    ),
    recordActivity({
      actor: req.user._id,
      action: 'HELP_TICKET_CREATED',
      entityType: 'settings',
      entityId: ticket._id,
      entityRef: helpTicketId,
      summary: `${req.user.fullName} submitted Help Center issue ${helpTicketId}: ${ticket.title}`,
    }),
  ]);

  emitBroadcast('help-ticket:changed', { action: 'created', helpTicketId: ticket._id });

  const populated = await HelpTicket.findById(ticket._id)
    .populate('submittedBy', 'fullName employeeId email role avatarColor')
    .populate('comments.author', 'fullName role avatarColor');

  return sendSuccess(res, populated, `Help ticket ${helpTicketId} submitted to Admin`, 201);
});

export const getHelpTicketById = asyncHandler(async (req, res) => {
  const ticket = await HelpTicket.findOne({ _id: req.params.id, isDeleted: false })
    .populate('submittedBy', 'fullName employeeId email role avatarColor')
    .populate('resolvedBy', 'fullName employeeId')
    .populate('comments.author', 'fullName role avatarColor')
    .lean();
  if (!ticket) throw new AppError('Help ticket not found.', 404);

  if (req.user.role !== ROLES.ADMIN && String(ticket.submittedBy?._id) !== String(req.user._id)) {
    throw new AppError('You do not have permission to view this help ticket.', 403);
  }
  return sendSuccess(res, ticket, 'Help ticket retrieved');
});

export const updateHelpTicket = asyncHandler(async (req, res) => {
  const ticket = await HelpTicket.findOne({ _id: req.params.id, isDeleted: false });
  if (!ticket) throw new AppError('Help ticket not found.', 404);

  const isAdmin = req.user.role === ROLES.ADMIN;
  const isOwner = String(ticket.submittedBy) === String(req.user._id);
  if (!isAdmin && !isOwner) {
    throw new AppError('Permission denied.', 403);
  }

  const { status, adminNotes, severity, category, title, description } = req.body;
  const prevStatus = ticket.status;

  if (isAdmin) {
    if (status && ['Open', 'Under Review', 'In Progress', 'Resolved', 'Closed'].includes(status)) {
      ticket.status = status;
      if (['Resolved', 'Closed'].includes(status)) {
        ticket.resolvedBy = req.user._id;
        ticket.resolvedAt = new Date();
      }
    }
    if (adminNotes !== undefined) ticket.adminNotes = String(adminNotes).trim();
  }

  if (severity) ticket.severity = severity;
  if (category) ticket.category = category;
  if (title) ticket.title = String(title).trim();
  if (description) ticket.description = String(description).trim();

  await ticket.save();

  if (isAdmin && String(ticket.submittedBy) !== String(req.user._id)) {
    await createNotification({
      recipient: ticket.submittedBy,
      actor: req.user._id,
      type: 'ticket_updated',
      title: `Help Ticket ${ticket.helpTicketId} Updated (${ticket.status})`,
      message:
        adminNotes
          ? `Admin response: ${adminNotes}`
          : `Status changed from ${prevStatus} to ${ticket.status}.`,
      link: `/help-center?ticket=${ticket._id}`,
      entityType: 'help_ticket',
      entityId: ticket._id,
    });
  }

  emitBroadcast('help-ticket:changed', { action: 'updated', helpTicketId: ticket._id });
  const populated = await HelpTicket.findById(ticket._id)
    .populate('submittedBy', 'fullName employeeId email role avatarColor')
    .populate('resolvedBy', 'fullName employeeId')
    .populate('comments.author', 'fullName role avatarColor');

  return sendSuccess(res, populated, `Help ticket ${ticket.helpTicketId} updated`);
});

export const addHelpTicketComment = asyncHandler(async (req, res) => {
  const ticket = await HelpTicket.findOne({ _id: req.params.id, isDeleted: false });
  if (!ticket) throw new AppError('Help ticket not found.', 404);

  const isAdmin = req.user.role === ROLES.ADMIN;
  const isOwner = String(ticket.submittedBy) === String(req.user._id);
  if (!isAdmin && !isOwner) {
    throw new AppError('Permission denied.', 403);
  }

  const body = String(req.body.body || '').trim();
  const attachments = mapUploadedFiles(req.files);
  if (!body && attachments.length === 0) {
    throw new AppError('Comment text or file upload is required.', 400);
  }

  ticket.comments.push({
    author: req.user._id,
    body: body || 'Attached screenshot / file',
    attachments,
  });
  await ticket.save();

  if (isAdmin && !isOwner) {
    await createNotification({
      recipient: ticket.submittedBy,
      actor: req.user._id,
      type: 'comment_added',
      title: `Admin commented on ${ticket.helpTicketId}`,
      message: body || 'Uploaded attachment on your Help Center ticket.',
      link: `/help-center?ticket=${ticket._id}`,
      entityType: 'help_ticket',
      entityId: ticket._id,
    });
  } else if (!isAdmin) {
    const admins = await User.find({ role: ROLES.ADMIN, isDeleted: false, status: { $ne: 'Inactive' } })
      .select('_id')
      .lean();
    await Promise.all(
      admins.map((adm) =>
        createNotification({
          recipient: adm._id,
          actor: req.user._id,
          type: 'comment_added',
          title: `Reply on Help Ticket ${ticket.helpTicketId}`,
          message: `${req.user.fullName}: ${body || 'Uploaded attachment'}`,
          link: `/help-center?ticket=${ticket._id}`,
          entityType: 'help_ticket',
          entityId: ticket._id,
        })
      )
    );
  }

  emitBroadcast('help-ticket:changed', { action: 'commented', helpTicketId: ticket._id });
  const populated = await HelpTicket.findById(ticket._id)
    .populate('submittedBy', 'fullName employeeId email role avatarColor')
    .populate('resolvedBy', 'fullName employeeId')
    .populate('comments.author', 'fullName role avatarColor');

  return sendSuccess(res, populated, 'Reply added to help ticket');
});

export const deleteHelpTicket = asyncHandler(async (req, res) => {
  const ticket = await HelpTicket.findOne({ _id: req.params.id, isDeleted: false });
  if (!ticket) throw new AppError('Help ticket not found.', 404);
  if (req.user.role !== ROLES.ADMIN && String(ticket.submittedBy) !== String(req.user._id)) {
    throw new AppError('Permission denied.', 403);
  }
  ticket.isDeleted = true;
  await ticket.save();
  emitBroadcast('help-ticket:changed', { action: 'deleted', helpTicketId: ticket._id });
  return sendSuccess(res, null, `Help ticket ${ticket.helpTicketId} removed`);
});

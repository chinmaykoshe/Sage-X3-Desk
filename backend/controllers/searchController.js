import Ticket from '../../db/models/Ticket.js';
import Task from '../../db/models/Task.js';
import Client from '../../db/models/Client.js';
import Project from '../../db/models/Project.js';
import User from '../../db/models/User.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { ROLES } from '../config/constants.js';

export const globalSearch = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return sendSuccess(res, { tickets: [], tasks: [], clients: [], projects: [], employees: [] }, 'Empty query');
  }
  const regex = { $regex: q, $options: 'i' };

  const ticketFilter = {
    isDeleted: false,
    $or: [{ ticketId: regex }, { title: regex }, { folderCode: regex }],
  };
  if (req.user.role === ROLES.DEVELOPER) {
    ticketFilter.$and = [
      { $or: [{ assignedDevelopers: req.user._id }, { createdBy: req.user._id }] },
      { $or: ticketFilter.$or },
    ];
    delete ticketFilter.$or;
  }

  const [tickets, tasks, clients, projects, employees] = await Promise.all([
    Ticket.find(ticketFilter)
      .populate('client', 'companyName clientFolderCode')
      .select('ticketId title status priority client folderCode')
      .limit(6)
      .lean(),
    Task.find({ isDeleted: false, $or: [{ taskId: regex }, { title: regex }] })
      .populate('client', 'companyName')
      .select('taskId title status priority ticket client')
      .limit(6)
      .lean(),
    Client.find({
      isDeleted: false,
      $or: [{ clientId: regex }, { companyName: regex }, { clientFolderCode: regex }],
    })
      .select('clientId companyName clientFolderCode sageX3Version')
      .limit(5)
      .lean(),
    Project.find({ isDeleted: false, $or: [{ projectId: regex }, { name: regex }] })
      .populate('client', 'companyName')
      .select('projectId name status client')
      .limit(5)
      .lean(),
    User.find({
      isDeleted: false,
      role: { $ne: ROLES.CLIENT },
      $or: [{ fullName: regex }, { employeeId: regex }, { email: regex }, { skills: regex }],
    })
      .select('employeeId fullName designation role avatarColor')
      .limit(5)
      .lean(),
  ]);

  return sendSuccess(res, { tickets, tasks, clients, projects, employees }, 'Search results');
});

import { z } from 'zod';
import {
  ROLES,
  TICKET_CATEGORIES,
  PRIORITIES,
  SEVERITIES,
  TICKET_STATUSES,
  TASK_STATUSES,
  PROJECT_STATUSES,
  DEPLOYMENT_ENVIRONMENTS,
  DEPLOYMENT_STAGES,
  DEPLOYMENT_APPROVAL_STATUSES,
  DEPLOYMENT_TESTING_STATUSES,
} from '../config/constants.js';

const optionalObjectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format').optional().nullable().or(z.literal(''));
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');

export const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  contactNumber: z.string().optional().default(''),
  designation: z.string().optional().default('Sage X3 Developer'),
  department: z.string().optional().default('Sage X3 Practice'),
});

export const userCreateSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  contactNumber: z.string().optional().default(''),
  designation: z.string().optional().default('Sage X3 Consultant'),
  department: z.string().optional().default('Sage X3 Practice'),
  role: z.enum([ROLES.ADMIN, ROLES.TEAM_LEAD, ROLES.DEVELOPER, ROLES.CLIENT]).default(ROLES.DEVELOPER),
  team: optionalObjectId,
  joiningDate: z.string().optional().nullable(),
  status: z.enum(['Active', 'Inactive', 'On Leave']).optional().default('Active'),
  skills: z.array(z.string()).optional().default([]),
  permissions: z
    .object({
      canAssignTickets: z.boolean().optional(),
      canApproveDeployments: z.boolean().optional(),
      canManageClients: z.boolean().optional(),
      canViewReports: z.boolean().optional(),
      canWaiveTicketClose: z.boolean().optional(),
    })
    .optional(),
});

export const userUpdateSchema = userCreateSchema.partial().extend({
  password: z.string().min(6).optional().or(z.literal('')),
});

export const clientSchema = z.object({
  companyName: z.string().min(2, 'Company name is required'),
  companyDescription: z.string().optional().default(''),
  primaryContactPerson: z.string().min(2, 'Primary contact person is required'),
  contactEmail: z.string().email('Valid contact email is required'),
  contactNumber: z.string().optional().default(''),
  address: z.string().optional().default(''),
  accountStatus: z.enum(['Active', 'Onboarding', 'On Hold', 'Inactive']).optional().default('Active'),
  internalNotes: z.string().optional().default(''),
  sageX3Version: z.string().optional().default('V12 P33'),
  clientFolderCode: z.string().min(2, 'Client folder code is required'),
  pilotFolderCode: z.string().optional().default(''),
  productionFolderCode: z.string().optional().default(''),
  hostingInformation: z.string().optional().default(''),
  integrationDetails: z.string().optional().default(''),
  supportAgreementInfo: z.string().optional().default(''),
  slaResponseHours: z.coerce.number().min(1).max(720).optional().default(24),
  accountManager: optionalObjectId,
  environments: z
    .array(
      z.object({
        name: z.string().min(1),
        environmentType: z.enum([...DEPLOYMENT_ENVIRONMENTS, 'UAT', 'Sandbox']).default('Pilot'),
        folderCode: z.string().min(1),
        serverUrl: z.string().optional().default(''),
        databaseName: z.string().optional().default(''),
        patchLevel: z.string().optional().default(''),
        notes: z.string().optional().default(''),
      })
    )
    .optional(),
});

export const environmentSchema = z.object({
  name: z.string().min(1, 'Environment name is required'),
  environmentType: z.enum([...DEPLOYMENT_ENVIRONMENTS, 'UAT', 'Sandbox']).default('Pilot'),
  folderCode: z.string().min(1, 'Folder code is required'),
  serverUrl: z.string().optional().default(''),
  databaseName: z.string().optional().default(''),
  patchLevel: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

export const ticketCreateSchema = z.object({
  title: z.string().min(3, 'Ticket title must be at least 3 characters'),
  description: z.string().min(5, 'Description is required'),
  client: objectId,
  project: optionalObjectId,
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(PRIORITIES).default('Medium'),
  severity: z.enum(SEVERITIES).default('Minor'),
  status: z.enum(TICKET_STATUSES).optional(),
  reportedBy: z.string().optional().default('Client Contact'),
  assignedDevelopers: z.array(objectId).optional().default([]),
  assignedTeamLead: optionalObjectId,
  dueDate: z.string().optional().nullable(),
  sageX3Environment: z.enum([...DEPLOYMENT_ENVIRONMENTS, 'UAT', 'Sandbox']).default('Pilot'),
  folderCode: z.string().optional().default(''),
  internalNotes: z.string().optional().default(''),
});

export const ticketUpdateSchema = ticketCreateSchema.partial();

export const ticketStatusSchema = z.object({
  status: z.enum(TICKET_STATUSES),
  note: z.string().optional().default(''),
  waiveIncompleteTasks: z.boolean().optional().default(false),
  waiveReason: z.string().optional().default(''),
});

export const ticketAssignSchema = z.object({
  assignedDevelopers: z.array(objectId).optional(),
  assignedTeamLead: optionalObjectId,
  note: z.string().optional().default(''),
});

export const taskCreateSchema = z.object({
  title: z.string().min(2, 'Task title is required'),
  description: z.string().optional().default(''),
  ticket: optionalObjectId,
  parentTask: optionalObjectId,
  dependencies: z.array(objectId).optional().default([]),
  isIndependentInternalTask: z.boolean().optional().default(false),
  client: optionalObjectId,
  project: optionalObjectId,
  assignedEmployees: z.array(objectId).optional().default([]),
  priority: z.enum(PRIORITIES).default('Medium'),
  status: z.enum(TASK_STATUSES).optional().default('Todo'),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  estimatedHours: z.coerce.number().min(0).optional().default(0),
  completionPercentage: z.coerce.number().min(0).max(100).optional().default(0),
  sortOrder: z.coerce.number().optional(),
});

export const taskUpdateSchema = taskCreateSchema.partial().extend({
  actualHours: z.coerce.number().min(0).optional(),
  submittedForReview: z.boolean().optional(),
});

export const taskStatusSchema = z.object({
  status: z.enum(TASK_STATUSES),
  completionPercentage: z.coerce.number().min(0).max(100).optional(),
  submittedForReview: z.boolean().optional(),
  note: z.string().optional().default(''),
});

export const projectCreateSchema = z.object({
  name: z.string().min(2, 'Project name is required'),
  client: objectId,
  description: z.string().optional().default(''),
  projectManager: objectId,
  teamMembers: z.array(objectId).optional().default([]),
  startDate: z.string().optional().nullable(),
  targetCompletionDate: z.string().optional().nullable(),
  status: z.enum(PROJECT_STATUSES).optional().default('Active'),
  progressPercentage: z.coerce.number().min(0).max(100).optional().default(0),
  sageX3Modules: z.array(z.string()).optional().default([]),
});

export const projectUpdateSchema = projectCreateSchema.partial();

export const milestoneSchema = z.object({
  title: z.string().min(2, 'Milestone title is required'),
  description: z.string().optional().default(''),
  dueDate: z.string().optional().nullable(),
  status: z.enum(['Pending', 'In Progress', 'Completed', 'Delayed']).optional().default('Pending'),
  order: z.coerce.number().optional().default(0),
});

export const deploymentCreateSchema = z.object({
  ticket: optionalObjectId,
  task: optionalObjectId,
  client: objectId,
  sageX3Folder: z.string().min(2, 'Sage X3 folder is required'),
  environment: z.enum(DEPLOYMENT_ENVIRONMENTS).default('Development'),
  workflowStage: z.enum(DEPLOYMENT_STAGES).default('Development Completed'),
  versionReference: z.string().min(1, 'Version or release reference is required'),
  description: z.string().min(3, 'Deployment description is required'),
  patchObjects: z.string().optional().default(''),
  deploymentDate: z.string().optional().nullable(),
  testingStatus: z.enum(DEPLOYMENT_TESTING_STATUSES).optional().default('Pending'),
  deploymentNotes: z.string().optional().default(''),
});

export const deploymentStatusSchema = z.object({
  environment: z.enum(DEPLOYMENT_ENVIRONMENTS).optional(),
  workflowStage: z.enum(DEPLOYMENT_STAGES).optional(),
  approvalStatus: z.enum(DEPLOYMENT_APPROVAL_STATUSES).optional(),
  approvalNotes: z.string().optional().default(''),
  testingStatus: z.enum(DEPLOYMENT_TESTING_STATUSES).optional(),
  deploymentNotes: z.string().optional(),
  sageX3Folder: z.string().optional(),
  versionReference: z.string().optional(),
  note: z.string().optional().default(''),
});

export const commentCreateSchema = z.object({
  entityType: z.enum(['ticket', 'task', 'deployment', 'project']),
  entityId: objectId,
  parentComment: optionalObjectId,
  body: z.string().min(1, 'Comment cannot be empty'),
  isInternal: z.boolean().optional().default(true),
  mentions: z.array(objectId).optional().default([]),
});

export const commentUpdateSchema = z.object({
  body: z.string().min(1, 'Comment cannot be empty'),
  isInternal: z.boolean().optional(),
});

export const reorderSchema = z.object({
  id: objectId,
  groupBy: z.enum(['status', 'priority', 'assignee', 'client']).default('status'),
  destinationValue: z.string().optional().nullable(),
  newSortOrder: z.coerce.number(),
  waiveIncompleteTasks: z.boolean().optional().default(false),
  waiveReason: z.string().optional().default(''),
});

export const bulkActionSchema = z.object({
  ids: z.array(objectId).min(1, 'Select at least one record'),
  action: z.enum(['status', 'priority', 'assign', 'dueDate', 'project', 'archive']),
  value: z.any().optional(),
});

export const taskAssignSchema = z.object({
  assignedEmployees: z.array(objectId),
  note: z.string().optional().default(''),
});

export const savedViewSchema = z.object({
  name: z.string().min(1, 'View name is required').max(60),
  entityType: z.enum(['ticket', 'task']),
  viewMode: z.enum(['board', 'list', 'calendar', 'timeline', 'workload']).default('board'),
  isShared: z.boolean().optional().default(false),
  isPinned: z.boolean().optional().default(false),
  isDefault: z.boolean().optional().default(false),
  config: z
    .object({
      groupBy: z.string().optional(),
      sortBy: z.string().optional(),
      sortOrder: z.string().optional(),
      filters: z.record(z.any()).optional(),
      hiddenColumns: z.array(z.string()).optional(),
      visibleFields: z.array(z.string()).optional(),
      hideEmptyColumns: z.boolean().optional(),
    })
    .optional()
    .default({}),
});

export const timeLogCreateSchema = z
  .object({
    task: optionalObjectId,
    ticket: optionalObjectId,
    client: optionalObjectId,
    project: optionalObjectId,
    projectCode: z.string().trim().max(80).optional().default(''),
    taskTitle: z.string().trim().max(200).optional().default(''),
    taskType: z.string().trim().max(120).optional().default(''),
    entryStatus: z.enum(['DONE', 'IN PROGRESS', 'PENDING', 'BLOCKED']).optional().default('DONE'),
    date: z.string().optional().nullable(),
    hoursSpent: z.coerce.number().min(0.1, 'Minimum 0.1 hours').max(24, 'Cannot exceed 24 hours per entry'),
    workDescription: z.string().min(2, 'Work description is required'),
    billable: z.boolean().optional().default(true),
  })
  .refine((d) => Boolean(d.task || d.taskTitle || d.workDescription), {
    message: 'Task or task title is required',
  });

export const timeLogUpdateSchema = z.object({
  task: optionalObjectId,
  ticket: optionalObjectId,
  client: optionalObjectId,
  project: optionalObjectId,
  projectCode: z.string().trim().max(80).optional(),
  taskTitle: z.string().trim().max(200).optional(),
  taskType: z.string().trim().max(120).optional(),
  entryStatus: z.enum(['DONE', 'IN PROGRESS', 'PENDING', 'BLOCKED']).optional(),
  date: z.string().optional().nullable(),
  hoursSpent: z.coerce.number().min(0.1, 'Minimum 0.1 hours').max(24, 'Cannot exceed 24 hours per entry').optional(),
  workDescription: z.string().min(2, 'Work description is required').optional(),
  billable: z.boolean().optional(),
});

export const knowledgeBaseSchema = z.object({
  title: z.string().min(3, 'Title is required'),
  category: z.enum([
    '4GL Scripting',
    'Import / Export',
    'Web Services & API',
    'Crystal Reports',
    'Database & Patching',
    'Finance & Banking',
    'Supply Chain & Stock',
    'Runbook',
  ]),
  sageX3Version: z.string().optional().default('V12'),
  tags: z.array(z.string()).optional().default([]),
  summary: z.string().optional().default(''),
  content: z.string().min(10, 'Article content is required'),
  isPublished: z.boolean().optional().default(true),
});

// ─── Auth — new schemas ───────────────────────────────────────────────────────
export const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email is required'),
  reason: z.string().optional().default(''),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32, 'Invalid token'),
  code: z.string().length(4, 'Code must be exactly 4 digits'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

export const verifyEmailSchema = z.object({
  email: z.string().email('Valid email is required'),
  code: z.string().length(4, 'Code must be exactly 4 digits'),
});

export const resendVerificationSchema = z.object({
  email: z.string().email('Valid email is required'),
});

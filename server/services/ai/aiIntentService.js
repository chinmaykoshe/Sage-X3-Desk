import { z } from 'zod';
import { chatWithOllama, extractJsonFromText } from './ollamaService.js';
import { buildIntentSystemPrompt } from './aiPromptService.js';

export const ALLOWED_INTENTS = [
  'NAVIGATE',
  'FILTER_TICKETS',
  'FILTER_TASKS',
  'FILTER_CLIENTS',
  'FILTER_PROJECTS',
  'SEARCH_RECORDS',
  'OPEN_TICKET',
  'OPEN_TASK',
  'OPEN_CLIENT',
  'SHOW_APPROVAL_QUEUE',
  'SHOW_MY_WORK',
  'SHOW_OVERDUE',
  'SUMMARIZE_CLIENT',
  'CREATE_TICKET_DRAFT',
  'CREATE_USER_REQUEST',
  'CREATE_CLIENT_REQUEST',
  'GENERAL_ANSWER',
];

const intentSchema = z.object({
  intent: z.enum(ALLOWED_INTENTS).default('GENERAL_ANSWER'),
  entities: z.record(z.any()).optional().default({}),
  needsClarification: z.boolean().optional().default(false),
  clarificationQuestion: z.string().optional().default(''),
  response: z.string().optional().default(''),
});

/**
 * Deterministic rule-assisted parser for common navigation/filter/follow-up commands
 * so fast UI queries work reliably even if the 1.5B model needs guidance or Ollama is offline.
 */
function deterministicFallbackIntent(message, context) {
  const lower = message.toLowerCase().trim();
  const ticketIdMatch = message.match(/\b(TKT-\d+)\b/i);
  const taskIdMatch = message.match(/\b(TSK-\d+)\b/i);

  if (ticketIdMatch) {
    return {
      intent: 'OPEN_TICKET',
      entities: { ticketId: ticketIdMatch[1].toUpperCase() },
      response: `Opening ${ticketIdMatch[1].toUpperCase()}.`,
    };
  }
  if (taskIdMatch) {
    return {
      intent: 'OPEN_TASK',
      entities: { taskId: taskIdMatch[1].toUpperCase() },
      response: `Opening ${taskIdMatch[1].toUpperCase()}.`,
    };
  }

  // Follow-up context handling ("Only the pending ones", "Who is handling the first one?")
  if (/only\s+(the\s+)?(pending|open)/i.test(lower) && context.conversationContext?.lastClientName) {
    return {
      intent: 'FILTER_TICKETS',
      entities: {
        client: context.conversationContext.lastClientName,
        status: ['New', 'Assigned', 'In Progress', 'On Hold', 'Awaiting Client Response', 'Testing', 'Reopened'],
      },
      response: `Showing pending tickets for ${context.conversationContext.lastClientName}.`,
    };
  }
  if (/who\s+is\s+(handling|working|assigned)/i.test(lower) && context.conversationContext?.lastResultIds?.length) {
    return {
      intent: 'GENERAL_ANSWER',
      entities: { inspectFirstTicket: true },
      response: '',
    };
  }

  if (/(pending\s+tl|tl\s+approval|approval\s+(queue|inbox)|waiting\s+for\s+approval)/i.test(lower)) {
    return {
      intent: 'SHOW_APPROVAL_QUEUE',
      entities: { status: 'Pending TL Approval' },
      response: 'Opening the Team Lead Approval Inbox.',
    };
  }

  if (/(smart\s+add|intake|create\s+(a\s+)?ticket|log\s+(a\s+)?ticket|draft\s+ticket)/i.test(lower)) {
    return {
      intent: 'CREATE_TICKET_DRAFT',
      entities: { client: context.matchedClient?.name || '' },
      response: 'Preparing a ticket draft.',
    };
  }

  if (/(add|create|onboard)\s+(a\s+)?(new\s+)?(user|employee|member|developer)/i.test(lower)) {
    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const roleMatch = message.match(/\b(Admin|Administrator|Team Lead|Manager|Developer|Employee)\b/i);
    const nameMatch = message.replace(/(add|create|onboard)\s+(a\s+)?(new\s+)?(user|employee|member|developer)\s*/i, '')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
      .replace(/\b(email|role|as|with|named)\b/gi, '')
      .replace(/\b(Admin|Administrator|Team Lead|Manager|Developer|Employee)\b/gi, '')
      .trim();
    return {
      intent: 'CREATE_USER_REQUEST',
      entities: {
        name: nameMatch || 'New Team Member',
        email: emailMatch ? emailMatch[0] : '',
        role: roleMatch ? roleMatch[1] : 'Developer / Employee',
      },
      response: 'Submitting new user request for Team Lead approval.',
    };
  }

  if (/(add|create|onboard)\s+(a\s+)?(new\s+)?client/i.test(lower)) {
    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const nameMatch = message.replace(/(add|create|onboard)\s+(a\s+)?(new\s+)?client\s*/i, '')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
      .replace(/\b(email|industry|version|named|for)\b/gi, '')
      .trim();
    return {
      intent: 'CREATE_CLIENT_REQUEST',
      entities: {
        name: nameMatch || 'New Client',
        email: emailMatch ? emailMatch[0] : '',
      },
      response: 'Submitting new client request for Team Lead approval.',
    };
  }

  if (/(client\s+profile|open\s+client|open\s+the\s+client)/i.test(lower) && context.matchedClient) {
    return {
      intent: 'OPEN_CLIENT',
      entities: { client: context.matchedClient.name },
      response: `Opening client profile for ${context.matchedClient.name}.`,
    };
  }

  if (/summarize|summary/i.test(lower) && context.matchedClient) {
    return {
      intent: 'SUMMARIZE_CLIENT',
      entities: { client: context.matchedClient.name },
      response: `Summarizing recent issues for ${context.matchedClient.name}.`,
    };
  }

  if (/overdue/i.test(lower) && /task/i.test(lower)) {
    return {
      intent: 'FILTER_TASKS',
      entities: {
        overdueOnly: true,
        employee: context.matchedEmployee?.name || '',
      },
      response: 'Filtering overdue tasks.',
    };
  }

  if (/overdue/i.test(lower) && /ticket/i.test(lower)) {
    return {
      intent: 'FILTER_TICKETS',
      entities: {
        overdueOnly: true,
        developer: context.matchedEmployee?.name || '',
      },
      response: 'Filtering overdue tickets.',
    };
  }

  if (/(my\s+assigned\s+tasks|my\s+tasks|my\s+work)/i.test(lower)) {
    return {
      intent: 'SHOW_MY_WORK',
      entities: {},
      response: 'Showing your assigned work.',
    };
  }

  if (/deployment|production/i.test(lower) && /(show|recent|list|open|view)/i.test(lower)) {
    return {
      intent: 'NAVIGATE',
      entities: { destination: 'deployments' },
      response: 'Opening the Sage X3 Deployment Pipeline.',
    };
  }

  if (/workload/i.test(lower)) {
    return {
      intent: 'NAVIGATE',
      entities: { destination: 'workload' },
      response: 'Opening the Team Workload view.',
    };
  }

  // Direct route navigation without invoking Ollama unnecessarily
  const routePhrases = [
    { re: /\b(overview|dashboard|home)\b/i, dest: 'overview', label: 'Overview Dashboard' },
    { re: /\b(inbox|notifications?)\b/i, dest: 'inbox', label: 'Inbox & Notifications' },
    { re: /\b(smart\s*intake|ai\s*intake)\b/i, dest: 'intake', label: 'Smart Ticket Intake' },
    { re: /\b(calendar|schedule)\b/i, dest: 'calendar', label: 'Calendar' },
    { re: /\b(task\s*board|tasks)\b/i, dest: 'task-board', label: 'Task Board' },
    { re: /\b(clients?|customers?)\b/i, dest: 'clients', label: 'Clients' },
    { re: /\b(projects?)\b/i, dest: 'projects', label: 'Projects' },
    { re: /\b(team\s*members?|employees?|directory)\b/i, dest: 'team', label: 'Team Members' },
    { re: /\b(reports?|analytics?)\b/i, dest: 'reports', label: 'Reports & Analytics' },
    { re: /\b(activity(\s*logs?)?|audit)\b/i, dest: 'activity', label: 'Activity Logs' },
    { re: /\b(knowledge\s*base|kb|runbooks?)\b/i, dest: 'knowledge-base', label: 'Knowledge Base' },
    { re: /\b(settings?|preferences)\b/i, dest: 'settings', label: 'Settings' },
    { re: /\b(profile|my\s*profile)\b/i, dest: 'profile', label: 'User Profile' },
  ];

  if (/^(go\s+to|open|show|navigate|view|switch\s+to)\b/i.test(lower)) {
    for (const rp of routePhrases) {
      if (rp.re.test(lower) && !context.matchedClient && !/ticket/i.test(lower)) {
        return {
          intent: 'NAVIGATE',
          entities: { destination: rp.dest },
          response: `Navigating to ${rp.label}.`,
        };
      }
    }
  }

  if (/ticket/i.test(lower) && (context.matchedClient || context.matchedEmployee || /open|all/i.test(lower))) {
    return {
      intent: 'FILTER_TICKETS',
      entities: {
        client: context.matchedClient?.name || '',
        developer: context.matchedEmployee?.name || '',
        status: /open/i.test(lower)
          ? ['New', 'Assigned', 'In Progress', 'On Hold', 'Awaiting Client Response', 'Testing', 'Reopened']
          : undefined,
      },
      response: 'Applying ticket filters.',
    };
  }

  return null;
}

/**
 * Parses a natural-language user message into a validated structured intent.
 * Uses deterministic routing directly for known navigation/filter commands and invokes Ollama only when needed.
 */
export async function parseUserIntent({ message, history = [], context, ollamaAvailable }) {
  const directMatch = deterministicFallbackIntent(message, context);

  // Use AI only where needed: deterministic routing & direct entity commands never call Ollama
  if (
    directMatch &&
    [
      'NAVIGATE',
      'OPEN_TICKET',
      'OPEN_TASK',
      'SHOW_APPROVAL_QUEUE',
      'OPEN_CLIENT',
      'SUMMARIZE_CLIENT',
      'SHOW_MY_WORK',
    ].includes(directMatch.intent)
  ) {
    return { ...directMatch, parsedBy: 'deterministic-router' };
  }

  if (
    directMatch &&
    ['FILTER_TICKETS', 'FILTER_TASKS'].includes(directMatch.intent) &&
    (directMatch.entities?.client ||
      directMatch.entities?.developer ||
      directMatch.entities?.employee ||
      directMatch.entities?.overdueOnly ||
      directMatch.entities?.status)
  ) {
    return { ...directMatch, parsedBy: 'deterministic-filter' };
  }

  if (!ollamaAvailable) {
    if (directMatch) {
      return { ...directMatch, parsedBy: 'deterministic-offline' };
    }
    return {
      intent: 'GENERAL_ANSWER',
      entities: {},
      needsClarification: false,
      clarificationQuestion: '',
      response:
        'X3 AI is not available for now. Please try again after a while. Direct navigation and manual ticket creation remain available.',
      parsedBy: 'offline-fallback',
    };
  }

  const systemPrompt = buildIntentSystemPrompt(context);
  const recentHistory = history.slice(-6).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  try {
    const aiRes = await chatWithOllama({
      messages: [
        { role: 'system', content: systemPrompt },
        ...recentHistory,
        { role: 'user', content: message },
      ],
      expectJson: true,
      temperature: 0.1,
    });

    const parsedJson = extractJsonFromText(aiRes.content);
    const validated = intentSchema.safeParse(parsedJson);

    if (validated.success) {
      // Merge deterministic matched client/employee if LLM omitted them or downgraded to generic NAVIGATE
      const merged = validated.data;
      if (directMatch && (merged.intent === 'GENERAL_ANSWER' || merged.intent === 'NAVIGATE')) {
        return { ...directMatch, parsedBy: 'hybrid' };
      }
      if (!merged.entities.client && context.matchedClient && ['FILTER_TICKETS', 'OPEN_CLIENT', 'SUMMARIZE_CLIENT'].includes(merged.intent)) {
        merged.entities.client = context.matchedClient.name;
      }
      return { ...merged, parsedBy: 'ollama' };
    }

    // Controlled fallback if 1.5B output failed schema validation
    if (directMatch) {
      return { ...directMatch, parsedBy: 'deterministic-recovery' };
    }

    return {
      intent: 'GENERAL_ANSWER',
      entities: {},
      needsClarification: true,
      clarificationQuestion: 'Could you clarify whether you want to filter tickets, search clients, or draft a new ticket?',
      response: aiRes.content?.slice(0, 400) || 'I could not structure that command clearly. Please rephrase or pick a suggested action.',
      parsedBy: 'text-fallback',
    };
  } catch {
    if (directMatch) {
      return { ...directMatch, parsedBy: 'deterministic-error-fallback' };
    }
    return {
      intent: 'GENERAL_ANSWER',
      entities: {},
      needsClarification: false,
      response:
        'X3 AI is not available for now. Please try again after a while. Manual navigation and ticket creation remain operational.',
      parsedBy: 'error-fallback',
    };
  }
}

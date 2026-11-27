import { z } from 'zod';
import { chatWithOllama, extractJsonFromText } from './ollamaService.js';
import { buildIntentSystemPrompt } from './aiPromptService.js';
import { isSensitiveCredentialQuery, SENSITIVE_REFUSAL_RESPONSE } from './aiDbQueryService.js';

export const ALLOWED_INTENTS = [
  'BLOCK_SENSITIVE',
  'QUERY_DATABASE',
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
  'CREATE_PROJECT_REQUEST',
  'BULK_CREATE_TEMPLATE',
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
/**
 * Parses CSV rows (with optional header line) or comma/`and`-separated natural lists
 * into an array of structured item payloads for bulk creation.
 */
function parseBulkItems(rawText, entityType, expectedCount = 0) {
  const lines = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Strip leading command line if user wrote e.g. "create 2 clients:\nname, desc, host, env1, env2\n..."
  const csvLines = lines.filter((l) => l.includes(','));
  if (csvLines.length > 0) {
    const splitCsv = (line) => line.split(',').map((c) => c.trim().replace(/^['"]|['"]$/g, ''));
    const firstCols = splitCsv(csvLines[0]).map((c) => c.toLowerCase());
    const headerKeywords = ['name', 'companyname', 'fullname', 'email', 'desc', 'description', 'host', 'hosting', 'env', 'env1', 'role', 'designation', 'client', 'status'];
    const hasHeader = firstCols.some((c) => headerKeywords.includes(c));
    const headers = hasHeader ? firstCols : null;
    const dataLines = hasHeader ? csvLines.slice(1) : csvLines;

    if (dataLines.length > 0) {
      return dataLines
        .map((line) => {
          const cols = splitCsv(line);
          if (!cols[0]) return null;
          if (headers) {
            const obj = { environments: [] };
            headers.forEach((h, idx) => {
              const val = cols[idx] || '';
              if (!val) return;
              if (['name', 'companyname', 'fullname'].includes(h)) obj.name = val;
              else if (['desc', 'description', 'companydescription'].includes(h)) obj.description = val;
              else if (['host', 'hosting', 'hostinginformation'].includes(h)) obj.hosting = val;
              else if (h === 'email' || h === 'contactemail') obj.email = val;
              else if (h === 'role') obj.role = val;
              else if (h === 'designation') obj.designation = val;
              else if (h === 'department') obj.department = val;
              else if (h === 'skills') obj.skills = val;
              else if (h === 'client') obj.client = val;
              else if (h === 'status') obj.status = val;
              else if (h === 'contact' || h === 'contactperson' || h === 'primarycontactperson') obj.contactPerson = val;
              else if (/^env\d*$|^environment\d*$/i.test(h)) obj.environments.push(val);
            });
            return obj.name ? obj : null;
          }

          // Headerless positional CSV
          if (entityType === 'client') {
            return {
              name: cols[0],
              description: cols[1] || '',
              hosting: cols[2] || '',
              environments: cols.slice(3).filter(Boolean),
            };
          }
          if (entityType === 'user') {
            return {
              name: cols[0],
              email: cols[1] || '',
              designation: cols[2] || 'Sage X3 Consultant',
              role: cols[3] || 'Developer / Employee',
              department: cols[4] || 'Sage X3 Practice',
              skills: cols[5] || '',
            };
          }
          return {
            name: cols[0],
            client: cols[1] || '',
            description: cols[2] || '',
            status: cols[3] || 'Active',
          };
        })
        .filter(Boolean);
    }
  }

  // Natural language list: e.g. "jayesh aryan and sujal" or "acme, beta and gamma"
  let cleaned = String(rawText || '')
    .replace(/^.*?(add|create|onboard|start)\s+(?:\d+\s+)?(?:a\s+|new\s+)*(?:users?|employees?|members?|developers?|clients?|projects?)\s*/i, '')
    .replace(/\b(named|called|here|please)\b/gi, '')
    .replace(/['"]/g, '')
    .trim();

  if (!cleaned) return [];
  let parts = cleaned
    .split(/\s*,\s*|\s+and\s+|\s*&\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);

  // If user wrote "create 3 new users jayesh aryan and sujal" (missing comma between first two names)
  if (expectedCount > 1 && parts.length < expectedCount) {
    const expanded = parts.flatMap((p) => p.split(/\s+/).filter(Boolean));
    if (expanded.length === expectedCount) parts = expanded;
  }

  return parts.map((name) => ({ name }));
}

function deterministicFallbackIntent(message, context) {
  const lower = message.toLowerCase().trim();

  if (isSensitiveCredentialQuery(message)) {
    return {
      intent: 'BLOCK_SENSITIVE',
      entities: {},
      response: SENSITIVE_REFUSAL_RESPONSE,
    };
  }

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

  if (/(smart\s+add|intake|\b(create|log|draft|new|raise|open)\s+(a\s+)?(new\s+)?ticket\b)/i.test(lower)) {
    return {
      intent: 'CREATE_TICKET_DRAFT',
      entities: { client: context.matchedClient?.name || '' },
      response: 'Preparing a ticket draft.',
    };
  }

  if (/(csv|bulk)\s*(format|template)|format\s+for\s+(users?|clients?|projects?)/i.test(lower)) {
    const target = /client/i.test(lower) ? 'client' : /user|employee|member/i.test(lower) ? 'user' : /project/i.test(lower) ? 'project' : 'all';
    return {
      intent: 'BULK_CREATE_TEMPLATE',
      entities: { target },
      response: 'Providing CSV format template.',
    };
  }

  if (/(add|create|onboard)\s+(?:\d+\s+)?(?:a\s+|new\s+)*(users?|employees?|members?|developers?)\b/i.test(lower)) {
    const countMatch = message.match(/\b(\d+)\s+(?:new\s+)?(?:users?|employees?|members?|developers?)/i);
    const expectedCount = countMatch ? Number(countMatch[1]) : 0;
    const bulkItems = parseBulkItems(message, 'user', expectedCount);
    if (bulkItems.length > 1 || message.includes(',')) {
      return {
        intent: 'CREATE_USER_REQUEST',
        entities: { items: bulkItems },
        response: `Creating ${bulkItems.length} user(s).`,
      };
    }

    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const roleMatch = message.match(/\b(Admin|Administrator|Team Lead|Manager|Developer|Employee)\b/i);
    const asMatch = message.match(/\bas\s+(?:a\s+)?(.+?)(?:\s+with|\s+email|$)/i);
    const designation = asMatch ? asMatch[1].replace(/['"]/g, '').trim() : '';
    const nameMatch = message
      .replace(/^.*?(add|create|onboard)\s+(?:\d+\s+)?(?:a\s+|new\s+)*(?:users?|employees?|members?|developers?)\s*/i, '')
      .replace(/\bas\s+(?:a\s+)?(.+?)(?:\s+with|\s+email|$)/i, '')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
      .replace(/\b(email|role|as|with|named|here|please)\b/gi, '')
      .replace(/\b(Admin|Administrator|Team Lead|Manager|Developer|Employee)\b/gi, '')
      .replace(/['"]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return {
      intent: 'CREATE_USER_REQUEST',
      entities: {
        name: nameMatch || 'New Team Member',
        email: emailMatch ? emailMatch[0] : '',
        role: roleMatch ? roleMatch[1] : 'Developer / Employee',
        designation,
      },
      response: 'Creating new user.',
    };
  }

  if (/(add|create|onboard)\s+(?:\d+\s+)?(?:a\s+|new\s+)*clients?\b/i.test(lower)) {
    const countMatch = message.match(/\b(\d+)\s+(?:new\s+)?clients?/i);
    const expectedCount = countMatch ? Number(countMatch[1]) : 0;
    const bulkItems = parseBulkItems(message, 'client', expectedCount);
    if (bulkItems.length > 1 || message.includes(',')) {
      return {
        intent: 'CREATE_CLIENT_REQUEST',
        entities: { items: bulkItems },
        response: `Creating ${bulkItems.length} client(s).`,
      };
    }

    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const nameMatch = message
      .replace(/^.*?(add|create|onboard)\s+(?:\d+\s+)?(?:a\s+|new\s+)*clients?\s*/i, '')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
      .replace(/\b(email|industry|version|named|for|here|please)\b/gi, '')
      .replace(/['"]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return {
      intent: 'CREATE_CLIENT_REQUEST',
      entities: {
        name: nameMatch || 'New Client',
        email: emailMatch ? emailMatch[0] : '',
      },
      response: 'Creating new client.',
    };
  }

  if (/(add|create|start)\s+(?:\d+\s+)?(?:a\s+|new\s+)*projects?\b/i.test(lower)) {
    const countMatch = message.match(/\b(\d+)\s+(?:new\s+)?projects?/i);
    const expectedCount = countMatch ? Number(countMatch[1]) : 0;
    const bulkItems = parseBulkItems(message, 'project', expectedCount);
    if (bulkItems.length > 1 || message.includes(',')) {
      return {
        intent: 'CREATE_PROJECT_REQUEST',
        entities: { items: bulkItems },
        response: `Creating ${bulkItems.length} project(s).`,
      };
    }

    const nameMatch = message
      .replace(/^.*?(add|create|start)\s+(?:\d+\s+)?(?:a\s+|new\s+)*projects?\s*/i, '')
      .replace(/\b(named|called|here|please)\b/gi, '')
      .replace(/['"]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return {
      intent: 'CREATE_PROJECT_REQUEST',
      entities: {
        name: nameMatch || 'New Sage X3 Project',
        client: context.matchedClient?.name || '',
      },
      response: 'Creating new project.',
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

  // Deterministic read-only database queries (run BEFORE generic routePhrases so "show recent/new users/clients" lists live DB rows)
  if (/duplicate\s*tickets?|duplicates?/i.test(lower)) {
    return {
      intent: 'QUERY_DATABASE',
      entities: { queryType: 'duplicate_tickets', search: '' },
      response: 'Checking database for duplicate tickets.',
    };
  }

  if (
    /^(?:list|show|get|find|give|fetch|who\s+are|recent|latest|new|all)?\s*(?:me\s+)?(?:all\s+|new\s+|latest\s+|recent\s+|the\s+)*(?:users?|team\s*members?|employees?|developers?)(?:\s+in\s+(?:db|database))?$/i.test(
      lower
    ) ||
    /\b(?:list|show|get|find|give|fetch)\s+(?:me\s+)?(?:all\s+|new\s+|recent\s+|latest\s+|the\s+)*(?:users?|team\s*members?|employees?|developers?)\b/i.test(
      lower
    ) ||
    /\b(?:new\s+users?|users?\s+in\s+(?:db|database))\b/i.test(lower)
  ) {
    return {
      intent: 'QUERY_DATABASE',
      entities: { queryType: 'new_users', search: '' },
      response: 'Fetching users from the database.',
    };
  }

  if (
    /\b(list|show|get|find|give|fetch)\s+(?:me\s+)?(?:all\s+|new\s+|recent\s+|latest\s+|the\s+)*clients?\b/i.test(lower) ||
    /\b(new|latest|recent)\s+clients?\b/i.test(lower) ||
    /\bclients?\s+in\s+(?:db|database)\b/i.test(lower)
  ) {
    return {
      intent: 'QUERY_DATABASE',
      entities: { queryType: 'clients', search: '' },
      response: 'Fetching clients from the database.',
    };
  }

  if (/\b(?:recent|latest|list|show|check|get|fetch)\s+(?:all\s+|recent\s+|the\s+)*emails?\b/i.test(lower)) {
    return {
      intent: 'QUERY_DATABASE',
      entities: { queryType: 'emails', search: '' },
      response: 'Fetching synced email messages.',
    };
  }

  if (/\b(?:recent|latest|list|show|check|get|fetch)\s+(?:all\s+|recent\s+|the\s+)*(?:tickets?)\b/i.test(lower) && !context.matchedClient && !context.matchedEmployee) {
    const qType = /pending|open/i.test(lower)
      ? 'pending_tickets'
      : /completed|closed|resolved/i.test(lower)
        ? 'completed_tickets'
        : 'tickets';
    const strippedTopic = message
      .replace(/\b(recent|latest|list|show|check|get|fetch|find|all|the|pending|open|completed|closed|resolved|tickets?|with|for|about|on|regarding)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      intent: 'QUERY_DATABASE',
      entities: { queryType: qType, search: strippedTopic },
      response: strippedTopic ? `Searching tickets matching "${strippedTopic}".` : 'Fetching tickets from the database.',
    };
  }

  if (/\b(time\s*sheet|my\s+hours|logged\s+hours|time\s*logs?)\b/i.test(lower)) {
    const cleanedTs = message
      .replace(/\b(show|get|list|my|time\s*sheet|hours|logged|time\s*logs?|for|about)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      intent: 'QUERY_DATABASE',
      entities: { queryType: 'timesheet', search: cleanedTs },
      response: 'Fetching timesheet entries.',
    };
  }

  if (/\b(space\s+consumed|db\s+stats?|database\s+stats?|counts?|how\s+many\s+(?:users?|clients?|tickets?|tasks?|projects?|emails?|records?))\b/i.test(lower)) {
    return {
      intent: 'QUERY_DATABASE',
      entities: { queryType: 'stats', search: '' },
      response: 'Fetching live database statistics.',
    };
  }

  if (/\b(?:show|list|recent|check)\s+(?:audit|activity|deletion|deleted)\s*logs?\b/i.test(lower) || /\badmin\s+deleted\b/i.test(lower)) {
    return {
      intent: 'QUERY_DATABASE',
      entities: { queryType: 'logs', search: /deleted/i.test(lower) ? 'deleted' : '' },
      response: 'Fetching activity and audit logs.',
    };
  }

  if (/\b(?:knowledge\s*base|kb)\b/i.test(lower) && /\b(search|find|list|show|articles?|about)\b/i.test(lower)) {
    const term = message.replace(/.*\b(?:search|find|list|show|about)\b/i, '').replace(/\b(in\s+)?(knowledge\s*base|kb|articles?)\b/gi, '').trim();
    return {
      intent: 'QUERY_DATABASE',
      entities: { queryType: 'knowledge_base', search: term },
      response: 'Searching Knowledge Base articles.',
    };
  }

  // Specific user/employee lookup (e.g. "user with name chinmay", "find user rohan", "who is chinmay")
  if (
    (/\b(?:user|employee|member|developer)\b/i.test(lower) && !/(create|add|onboard|format|template|go\s+to|open|navigate)/i.test(lower)) ||
    (context.matchedEmployee && !/ticket|task|overdue/i.test(lower))
  ) {
    const cleanedUser = message
      .replace(/\b(find|search|show|get|who|is|are|user|users|employee|employees|member|members|with|the|name|named|called|about|details|for|please)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      intent: 'QUERY_DATABASE',
      entities: { queryType: 'users', search: context.matchedEmployee?.name || cleanedUser },
      response: 'Searching users in the database.',
    };
  }

  // Specific client lookup (both matched and unmatched, e.g. "client hightide" or "dumb client")
  if (/\bclient\b/i.test(lower) && !/(create|add|onboard|format|template|go\s+to|open|navigate|ticket|summarize|summary)/i.test(lower)) {
    const cleaned = lower.replace(/\b(find|search|show|open|get|client|clients|for|named|with|name|about|details)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    return {
      intent: 'QUERY_DATABASE',
      entities: { queryType: 'clients', search: context.matchedClient?.name || cleaned || message },
      response: 'Checking clients in the database.',
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

  // Natural ticket topic lookups like "ticket for 2 bank setup" or "bank setup ticket"
  if (/\btickets?\b/i.test(lower) && !/(create|log|draft|raise|open|submit)\s+(a\s+)?(new\s+)?ticket\b/i.test(lower)) {
    const topic = message
      .replace(/\b(find|search|show|get|give|any|the|a|an|tickets?|for|with|about|on|regarding|related|to)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      intent: 'QUERY_DATABASE',
      entities: { queryType: 'tickets', search: topic },
      response: topic ? `Searching tickets for "${topic}".` : 'Fetching tickets from the database.',
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
      'BLOCK_SENSITIVE',
      'QUERY_DATABASE',
      'NAVIGATE',
      'OPEN_TICKET',
      'OPEN_TASK',
      'SHOW_APPROVAL_QUEUE',
      'OPEN_CLIENT',
      'SUMMARIZE_CLIENT',
      'SHOW_MY_WORK',
      'CREATE_USER_REQUEST',
      'CREATE_CLIENT_REQUEST',
      'CREATE_PROJECT_REQUEST',
      'CREATE_TICKET_DRAFT',
      'BULK_CREATE_TEMPLATE',
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
      // Explicit deterministic admin/action intents (user/client onboarding) take precedence over 1.5B guesses
      if (
        directMatch &&
        (['CREATE_USER_REQUEST', 'CREATE_CLIENT_REQUEST'].includes(directMatch.intent) ||
          validated.data.intent === 'GENERAL_ANSWER' ||
          validated.data.intent === 'NAVIGATE')
      ) {
        return { ...directMatch, parsedBy: 'hybrid' };
      }
      const merged = validated.data;
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

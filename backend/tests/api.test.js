import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import connectDB from '../../db/connection.js';
import app from '../app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function runTests() {
  await connectDB();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const req = async (urlPath, { method = 'GET', token, body } = {}) => {
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { status: res.status, json };
  };

  try {
    console.log('1. Testing Health Endpoint...');
    const health = await req('/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.success, true);

    console.log('2. Testing Login & Auth Profile...');
    const adminLogin = await req('/auth/login', {
      method: 'POST',
      body: { email: 'admin@sagex3desk.com', password: 'Password@123' },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.json.data.token;

    const leadLogin = await req('/auth/login', {
      method: 'POST',
      body: { email: 'ananya.rao@sagex3desk.com', password: 'Password@123' },
    });
    assert.equal(leadLogin.status, 200);
    const leadToken = leadLogin.json.data.token;

    const devLogin = await req('/auth/login', {
      method: 'POST',
      body: { email: 'rohan.k@sagex3desk.com', password: 'Password@123' },
    });
    assert.equal(devLogin.status, 200);
    const devToken = devLogin.json.data.token;

    const meRes = await req('/auth/me', { token: devToken });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.json.data.email, 'rohan.k@sagex3desk.com');

    console.log('3. Testing RBAC restrictions...');
    const forbiddenUserCreate = await req('/users', {
      method: 'POST',
      token: devToken,
      body: {
        fullName: 'Unauthorized User',
        email: 'unauth@sagex3desk.com',
        password: 'Password@123',
      },
    });
    assert.equal(forbiddenUserCreate.status, 403);

    const forbiddenReports = await req('/reports/tickets', { token: devToken });
    assert.equal(forbiddenReports.status, 403);

    const forbiddenSettings = await req('/settings', {
      method: 'PUT',
      token: leadToken,
      body: { companyName: 'Nope' },
    });
    assert.equal(forbiddenSettings.status, 403);

    console.log('4. Testing Clients & Multiple Environments...');
    const createClientRes = await req('/clients', {
      method: 'POST',
      token: leadToken,
      body: {
        companyName: 'Test Sage X3 Manufacturing',
        primaryContactPerson: 'Test Contact',
        contactEmail: 'contact@testx3.local',
        clientFolderCode: 'TSTPRD',
        pilotFolderCode: 'TSTPLT',
        productionFolderCode: 'TSTPRD',
        sageX3Version: 'V12 P35',
      },
    });
    assert.equal(createClientRes.status, 201);
    const clientId = createClientRes.json.data._id;

    const addEnvRes = await req(`/clients/${clientId}/environments`, {
      method: 'POST',
      token: leadToken,
      body: { name: 'TST UAT', environmentType: 'UAT', folderCode: 'TSTUAT' },
    });
    assert.equal(addEnvRes.status, 201);

    const clientDetail = await req(`/clients/${clientId}`, { token: leadToken });
    assert.equal(clientDetail.status, 200);
    assert.equal(clientDetail.json.data.environments.length, 3);

    console.log('5. Testing Projects & Milestones...');
    const createProjRes = await req('/projects', {
      method: 'POST',
      token: leadToken,
      body: {
        name: 'Automated Test Project',
        client: clientId,
        projectManager: leadLogin.json.data.user._id,
        teamMembers: [devLogin.json.data.user._id],
        sageX3Modules: ['Finance', '4GL'],
      },
    });
    assert.equal(createProjRes.status, 201);
    const projectId = createProjRes.json.data._id;

    const msRes = await req(`/projects/${projectId}/milestones`, {
      method: 'POST',
      token: leadToken,
      body: { title: 'Phase 1 Pilot Cutover', status: 'In Progress' },
    });
    assert.equal(msRes.status, 201);

    console.log('6. Testing Ticket -> Task -> Comment -> Upload -> TimeLog -> Close Rule...');
    const ticketRes = await req('/tickets', {
      method: 'POST',
      token: leadToken,
      body: {
        title: 'Automated Test Sage X3 4GL Issue',
        description: 'Testing ticket creation and task closure guardrails',
        client: clientId,
        project: projectId,
        category: 'Customization',
        priority: 'High',
        sageX3Environment: 'Pilot',
      },
    });
    assert.equal(ticketRes.status, 201);
    const ticketId = ticketRes.json.data._id;
    assert.match(ticketRes.json.data.ticketId, /^TKT-\d+/);

    // Task must link to parent ticket unless independent
    const invalidTask = await req('/tasks', {
      method: 'POST',
      token: devToken,
      body: { title: 'Orphan task should fail' },
    });
    assert.equal(invalidTask.status, 400);

    const taskRes = await req('/tasks', {
      method: 'POST',
      token: leadToken,
      body: {
        title: 'Write 4GL unit test script',
        ticket: ticketId,
        estimatedHours: 2,
      },
    });
    assert.equal(taskRes.status, 201);
    const taskId = taskRes.json.data._id;

    // Internal comment
    const commentRes = await req('/comments', {
      method: 'POST',
      token: devToken,
      body: {
        entityType: 'ticket',
        entityId: ticketId,
        body: 'Internal debug note on ZTEST4GL',
        isInternal: true,
      },
    });
    assert.equal(commentRes.status, 201);

    // Multipart file upload
    const fd = new FormData();
    fd.append('file', new Blob(['Sage X3 Trace Log Line 1\n'], { type: 'text/plain' }), 'x3trace.log');
    fd.append('entityType', 'ticket');
    fd.append('entityId', ticketId);
    const uploadRes = await fetch(`${baseUrl}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${devToken}` },
      body: fd,
    });
    assert.equal(uploadRes.status, 201);
    const uploadJson = await uploadRes.json();
    assert.equal(uploadJson.data.originalName, 'x3trace.log');

    // Developer cannot assign tickets
    const devAssign = await req(`/tickets/${ticketId}/assign`, {
      method: 'PATCH',
      token: devToken,
      body: { assignedDevelopers: [] },
    });
    assert.equal(devAssign.status, 403);

    // Ticket cannot be closed while task is incomplete without waiver
    const closeBlocked = await req(`/tickets/${ticketId}/status`, {
      method: 'PATCH',
      token: devToken,
      body: { status: 'Closed' },
    });
    assert.equal(closeBlocked.status, 400);

    // Time log updates task actualHours
    const timeRes = await req('/time-logs', {
      method: 'POST',
      token: devToken,
      body: {
        task: taskId,
        hoursSpent: 1.5,
        workDescription: 'Tested 4GL patch in TSTPLT',
      },
    });
    assert.equal(timeRes.status, 201);

    const taskDetail = await req(`/tasks/${taskId}`, { token: devToken });
    assert.equal(taskDetail.json.data.actualHours, 1.5);

    // Complete task, then close ticket
    const completeTask = await req(`/tasks/${taskId}/status`, {
      method: 'PATCH',
      token: devToken,
      body: { status: 'Completed' },
    });
    assert.equal(completeTask.status, 200);

    const closeSuccess = await req(`/tickets/${ticketId}/status`, {
      method: 'PATCH',
      token: leadToken,
      body: { status: 'Closed', note: 'All tasks verified' },
    });
    assert.equal(closeSuccess.status, 200);
    assert.equal(closeSuccess.json.data.status, 'Closed');

    // Reopen ticket retains previous history & increments reopenedCount
    const reopenRes = await req(`/tickets/${ticketId}/status`, {
      method: 'PATCH',
      token: leadToken,
      body: { status: 'Reopened', note: 'Client requested minor tweak' },
    });
    assert.equal(reopenRes.status, 200);
    assert.equal(reopenRes.json.data.reopenedCount, 1);

    console.log('7. Testing Production Deployment Approval Guardrail...');
    const depRes = await req('/deployments', {
      method: 'POST',
      token: devToken,
      body: {
        client: clientId,
        ticket: ticketId,
        task: taskId,
        sageX3Folder: 'TSTPLT',
        environment: 'Pilot',
        workflowStage: 'Pilot Testing',
        versionReference: 'REL-TEST-01',
        description: 'Automated test deployment',
      },
    });
    assert.equal(depRes.status, 201);
    const depId = depRes.json.data._id;

    // Promoting to Production before approval must fail
    const prodBlocked = await req(`/deployments/${depId}/status`, {
      method: 'PATCH',
      token: devToken,
      body: { environment: 'Production', workflowStage: 'Completed', deploymentNotes: 'Trying early' },
    });
    assert.equal(prodBlocked.status, 400);

    // Lead approves, then Production Completed succeeds
    const approved = await req(`/deployments/${depId}/status`, {
      method: 'PATCH',
      token: leadToken,
      body: { approvalStatus: 'Approved', testingStatus: 'Passed' },
    });
    assert.equal(approved.status, 200);

    const prodSuccess = await req(`/deployments/${depId}/status`, {
      method: 'PATCH',
      token: leadToken,
      body: {
        environment: 'Production',
        workflowStage: 'Completed',
        sageX3Folder: 'TSTPRD',
        deploymentNotes: 'Deployed during test cutover',
      },
    });
    assert.equal(prodSuccess.status, 200);
    assert.equal(prodSuccess.json.data.workflowStage, 'Completed');

    console.log('8. Testing KB, Activity Logs, Notifications, Settings & Reports...');
    const kbRes = await req('/knowledge-base', {
      method: 'POST',
      token: devToken,
      body: {
        title: 'Test KB Runbook',
        category: 'Runbook',
        content: 'Detailed Sage X3 runbook step by step guide.',
        tags: ['Test', '4GL'],
      },
    });
    assert.equal(kbRes.status, 201);
    const kbId = kbRes.json.data._id;

    const [dash, workload, ticketsRpt, timeRpt, logsRes, notifRes, settingsRes] = await Promise.all([
      req('/reports/dashboard?range=all', { token: adminToken }),
      req('/reports/workload', { token: leadToken }),
      req('/reports/tickets', { token: leadToken }),
      req('/reports/time-tracking', { token: leadToken }),
      req('/activity-logs', { token: adminToken }),
      req('/notifications', { token: leadToken }),
      req('/settings', { token: adminToken }),
    ]);

    assert.equal(dash.status, 200);
    assert.equal(workload.status, 200);
    assert.equal(ticketsRpt.status, 200);
    assert.equal(timeRpt.status, 200);
    assert.equal(logsRes.status, 200);
    assert.equal(notifRes.status, 200);
    assert.equal(settingsRes.status, 200);

    console.log('9. Testing Drag-Drop Reorder, Bulk, Subtasks, Threaded Comments, Saved Views & Search...');
    // Reorder ticket (status + sortOrder)
    const reorderTkt = await req('/tickets/reorder', {
      method: 'PATCH',
      token: leadToken,
      body: { id: ticketId, groupBy: 'status', destinationValue: 'Testing', newSortOrder: 250 },
    });
    assert.equal(reorderTkt.status, 200);
    assert.equal(reorderTkt.json.data.status, 'Testing');
    assert.equal(reorderTkt.json.data.sortOrder, 250);

    // Duplicate ticket
    const dupRes = await req(`/tickets/${ticketId}/duplicate`, { method: 'POST', token: leadToken });
    assert.equal(dupRes.status, 201);
    const dupTicketId = dupRes.json.data._id;

    // Bulk ticket priority update
    const bulkTkt = await req('/tickets/bulk', {
      method: 'POST',
      token: leadToken,
      body: { ids: [ticketId, dupTicketId], action: 'priority', value: 'Critical' },
    });
    assert.equal(bulkTkt.status, 200);
    assert.equal(bulkTkt.json.data.count, 2);

    // Nested Subtask + Parent Progress Calculation
    const subRes = await req('/tasks', {
      method: 'POST',
      token: devToken,
      body: { title: 'Nested subtask check', parentTask: taskId, status: 'Todo' },
    });
    assert.equal(subRes.status, 201);
    const subTaskId = subRes.json.data._id;

    // Reorder task + Workload Drag-Drop assign
    const reorderTsk = await req('/tasks/reorder', {
      method: 'PATCH',
      token: devToken,
      body: { id: taskId, groupBy: 'status', destinationValue: 'In Progress', newSortOrder: 120 },
    });
    assert.equal(reorderTsk.status, 200);
    assert.equal(reorderTsk.json.data.sortOrder, 120);

    const assignWorkload = await req(`/tasks/${taskId}/assign`, {
      method: 'PATCH',
      token: leadToken,
      body: { assignedEmployees: [devLogin.json.data.user._id], note: 'Workload drag' },
    });
    assert.equal(assignWorkload.status, 200);

    // Developer cannot assign via workload
    const devWorkloadBlocked = await req(`/tasks/${taskId}/assign`, {
      method: 'PATCH',
      token: devToken,
      body: { assignedEmployees: [] },
    });
    assert.equal(devWorkloadBlocked.status, 403);

    // Threaded comment + edit + delete
    const threadRoot = await req('/comments', {
      method: 'POST',
      token: devToken,
      body: { entityType: 'task', entityId: taskId, body: 'Root comment', isInternal: true },
    });
    assert.equal(threadRoot.status, 201);
    const rootCommentId = threadRoot.json.data._id;

    const threadReply = await req('/comments', {
      method: 'POST',
      token: leadToken,
      body: { entityType: 'task', entityId: taskId, parentComment: rootCommentId, body: 'Reply comment' },
    });
    assert.equal(threadReply.status, 201);

    const editComment = await req(`/comments/${rootCommentId}`, {
      method: 'PUT',
      token: devToken,
      body: { body: 'Edited root comment' },
    });
    assert.equal(editComment.status, 200);

    // Saved Views CRUD & Duplicate
    const viewRes = await req('/views', {
      method: 'POST',
      token: devToken,
      body: {
        name: 'My Dev Board',
        entityType: 'ticket',
        viewMode: 'board',
        config: { groupBy: 'priority' },
      },
    });
    assert.equal(viewRes.status, 201);
    const viewId = viewRes.json.data._id;

    const dupViewRes = await req(`/views/${viewId}/duplicate`, { method: 'POST', token: devToken });
    assert.equal(dupViewRes.status, 201);
    const dupViewId = dupViewRes.json.data._id;

    // Global Search
    const searchRes = await req('/search?q=Bank', { token: adminToken });
    assert.equal(searchRes.status, 200);
    assert.ok(searchRes.json.data.tickets.length >= 1);

    console.log('10. Testing X3 AI (Ollama qwen2.5-coder:1.5b), Navigation, Smart Intake & TL Approvals...');
    const aiStatus = await req('/ai/status', { token: devToken });
    assert.equal(aiStatus.status, 200);
    assert.equal(aiStatus.json.data.model, 'qwen2.5-coder:1.5b');
    console.log('    Ollama status:', aiStatus.json.data.available ? 'ONLINE' : 'OFFLINE', '| modelReady:', aiStatus.json.data.modelReady);

    // Scenario 1 & Context-aware follow-up
    const chat1 = await req('/ai/chat', {
      method: 'POST',
      token: leadToken,
      body: { message: 'Show me all tickets for ABC Manufacturing.' },
    });
    assert.equal(chat1.status, 200);
    assert.equal(chat1.json.data.assistantMessage.action.type, 'FILTER_TICKETS');
    const convId = chat1.json.data.conversationId;

    const chat2 = await req('/ai/chat', {
      method: 'POST',
      token: leadToken,
      body: { conversationId: convId, message: 'Only the pending ones.' },
    });
    assert.equal(chat2.status, 200);
    assert.equal(chat2.json.data.assistantMessage.action.type, 'FILTER_TICKETS');

    // Scenario 2: Overdue tasks assigned to Rohan
    const chat3 = await req('/ai/chat', {
      method: 'POST',
      token: leadToken,
      body: { conversationId: convId, message: 'Show me overdue tasks assigned to Rohan.' },
    });
    assert.equal(chat3.status, 200);
    assert.equal(chat3.json.data.assistantMessage.action.type, 'FILTER_TASKS');

    // Scenario 4: Text-only Smart Ticket Intake -> Pending TL Approval
    const intakeRes = await req('/ai/intake', {
      method: 'POST',
      token: devToken,
      body: {
        sourceType: 'text',
        sourceText: 'ABC Manufacturing – Bank statement import issue in HTPILOT. Transactions are missing from the imported statement.',
      },
    });
    assert.equal(intakeRes.status, 201);
    const draft1Id = intakeRes.json.data._id;
    assert.equal(intakeRes.json.data.approvalStatus, 'Pending TL Approval');
    assert.ok(intakeRes.json.data.clientId);

    // Developer cannot approve draft (403)
    const devApproveFail = await req(`/ai/drafts/${draft1Id}/approve`, {
      method: 'POST',
      token: devToken,
      body: {},
    });
    assert.equal(devApproveFail.status, 403);

    // Scenario 5: TL Approves -> creates permanent ticket TKT-2026-xxxxx
    const approveRes = await req(`/ai/drafts/${draft1Id}/approve`, {
      method: 'POST',
      token: leadToken,
      body: { comments: 'Approved by TL in test' },
    });
    assert.equal(approveRes.status, 200);
    const publishedTicketId = approveRes.json.data.ticket._id;
    assert.match(approveRes.json.data.ticket.ticketId, /^TKT-\d{4}-\d+/);

    // Duplicate approval prevented (409)
    const dupApprove = await req(`/ai/drafts/${draft1Id}/approve`, {
      method: 'POST',
      token: leadToken,
      body: {},
    });
    assert.equal(dupApprove.status, 409);

    // Scenario 6: Request changes -> resubmit -> Reject
    const intake2 = await req('/ai/intake', {
      method: 'POST',
      token: devToken,
      body: {
        sourceType: 'text',
        sourceText: 'Apex Global Logistics – Purchase invoice API timeout in APXPLT.',
      },
    });
    assert.equal(intake2.status, 201);
    const draft2Id = intake2.json.data._id;

    const reqChanges = await req(`/ai/drafts/${draft2Id}/request-changes`, {
      method: 'POST',
      token: leadToken,
      body: { comments: 'Add sample payload size' },
    });
    assert.equal(reqChanges.status, 200);
    assert.equal(reqChanges.json.data.approvalStatus, 'Changes Requested');

    const resubmit = await req(`/ai/drafts/${draft2Id}`, {
      method: 'PUT',
      token: devToken,
      body: { resubmit: true, generatedFields: { title: 'Apex AP Invoice API Timeout (>60 lines)' } },
    });
    assert.equal(resubmit.status, 200);
    assert.equal(resubmit.json.data.approvalStatus, 'Pending TL Approval');

    const rejectRes = await req(`/ai/drafts/${draft2Id}/reject`, {
      method: 'POST',
      token: leadToken,
      body: { reason: 'Duplicate of existing ticket TKT-1002' },
    });
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.json.data.approvalStatus, 'Rejected');

    // Deterministic navigation without hitting LLM
    const navChat = await req('/ai/chat', {
      method: 'POST',
      token: leadToken,
      body: { conversationId: convId, message: 'Go to clients' },
    });
    assert.equal(navChat.status, 200);
    assert.equal(navChat.json.data.assistantMessage.action.type, 'NAVIGATE');
    assert.equal(navChat.json.data.assistantMessage.action.route, '/clients');

    await req(`/ai/conversations/${convId}`, { method: 'DELETE', token: leadToken });
    await req(`/tickets/${publishedTicketId}`, { method: 'DELETE', token: adminToken });

    // Cleanup test records
    await req(`/views/${viewId}`, { method: 'DELETE', token: devToken });
    await req(`/views/${dupViewId}`, { method: 'DELETE', token: devToken });
    await req(`/comments/${threadReply.json.data._id}`, { method: 'DELETE', token: leadToken });
    await req(`/comments/${rootCommentId}`, { method: 'DELETE', token: devToken });
    await req(`/tasks/${subTaskId}`, { method: 'DELETE', token: adminToken });
    await req(`/tickets/${dupTicketId}`, { method: 'DELETE', token: adminToken });
    await req(`/knowledge-base/${kbId}`, { method: 'DELETE', token: adminToken });
    await req(`/deployments/${depId}`, { method: 'DELETE', token: adminToken });
    await req(`/tasks/${taskId}`, { method: 'DELETE', token: adminToken });
    await req(`/tickets/${ticketId}`, { method: 'DELETE', token: adminToken });
    await req(`/projects/${projectId}`, { method: 'DELETE', token: adminToken });
    await req(`/clients/${clientId}`, { method: 'DELETE', token: adminToken });

    console.log('ALL COMPREHENSIVE API TESTS PASSED!');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});

import crypto from 'crypto';
import BaseEmailProvider from './BaseEmailProvider.js';
import AppError from '../../utils/AppError.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * Microsoft Outlook / Microsoft 365 provider using Microsoft Graph API
 * and Microsoft Entra OAuth 2.0 client credentials flow.
 */
export default class MicrosoftOutlookProvider extends BaseEmailProvider {
  async authenticate() {
    const tenantId = this.integration.publicConfig?.tenantId || this.credentials.tenantId;
    const clientId = this.integration.publicConfig?.clientId || this.credentials.clientId;
    const clientSecret = this.credentials.clientSecret;

    if (!tenantId || !clientId || !clientSecret) {
      throw new AppError('Outlook requires Tenant ID, Client ID, and Client Secret.', 400);
    }

    // Reuse valid cached token with 2-minute safety buffer
    if (
      this.credentials.accessToken &&
      this.credentials.tokenExpiry &&
      new Date(this.credentials.tokenExpiry).getTime() > Date.now() + 120000
    ) {
      return this.credentials.accessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      const errMsg = data.error_description || data.error || `Entra auth failed (HTTP ${res.status})`;
      throw new AppError(`Outlook authentication failed: ${errMsg}`, 400);
    }

    const tokenExpiry = new Date(Date.now() + Number(data.expires_in || 3600) * 1000).toISOString();
    await this.saveCredentials(
      { accessToken: data.access_token, tokenExpiry },
      { connectionStatus: 'Connected', lastError: '', grantedScopes: ['Mail.Read', 'Mail.ReadWrite'] }
    );
    return data.access_token;
  }

  async graphRequest(path, options = {}) {
    const token = await this.authenticate();
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error?.message || `Graph API error (HTTP ${res.status})`;
      throw new AppError(msg, res.status === 401 || res.status === 403 ? 400 : res.status >= 400 && res.status < 500 ? res.status : 502);
    }
    return data;
  }

  async testConnection() {
    const mailbox = encodeURIComponent(this.integration.mailboxAddress);
    const folder = await this.graphRequest(`/users/${mailbox}/mailFolders/inbox?$select=id,displayName,unreadItemCount,totalItemCount`);
    return {
      ok: true,
      provider: 'outlook',
      mailbox: this.integration.mailboxAddress,
      inboxCount: folder?.totalItemCount ?? 0,
      unreadCount: folder?.unreadItemCount ?? 0,
    };
  }

  async fetchMessages({ since = null, maxResults = 20 } = {}) {
    const mailbox = encodeURIComponent(this.integration.mailboxAddress);
    const filter = since ? `&$filter=receivedDateTime ge ${new Date(since).toISOString()}` : '';
    const data = await this.graphRequest(
      `/users/${mailbox}/mailFolders/inbox/messages?$top=${maxResults}&$orderby=receivedDateTime desc&$select=id,internetMessageId,conversationId,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,body,bodyPreview,hasAttachments,internetMessageHeaders,isDraft${filter}`
    );
    const list = Array.isArray(data?.value) ? data.value : [];
    const normalized = [];
    for (const msg of list) {
      if (msg.isDraft) continue;
      const attachments = msg.hasAttachments ? await this.getAttachments(msg.id) : [];
      normalized.push(this.#normalizeGraphMessage(msg, attachments));
    }
    return normalized;
  }

  async getMessageDetails(providerMessageId) {
    const mailbox = encodeURIComponent(this.integration.mailboxAddress);
    const msg = await this.graphRequest(
      `/users/${mailbox}/messages/${encodeURIComponent(providerMessageId)}?$select=id,internetMessageId,conversationId,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,body,bodyPreview,hasAttachments,internetMessageHeaders`
    );
    const attachments = msg?.hasAttachments ? await this.getAttachments(msg.id) : [];
    return this.#normalizeGraphMessage(msg, attachments);
  }

  async getAttachments(providerMessageId) {
    const mailbox = encodeURIComponent(this.integration.mailboxAddress);
    const data = await this.graphRequest(`/users/${mailbox}/messages/${encodeURIComponent(providerMessageId)}/attachments`);
    const items = Array.isArray(data?.value) ? data.value : [];
    return items
      .filter((att) => att['@odata.type'] === '#microsoft.graph.fileAttachment' && att.contentBytes)
      .map((att) => ({
        providerAttachmentId: att.id,
        filename: att.name || 'attachment',
        mimeType: att.contentType || 'application/octet-stream',
        size: Number(att.size || 0),
        buffer: Buffer.from(att.contentBytes, 'base64'),
      }));
  }

  async getThreadInfo(conversationId) {
    const mailbox = encodeURIComponent(this.integration.mailboxAddress);
    const data = await this.graphRequest(
      `/users/${mailbox}/messages?$filter=conversationId eq '${String(conversationId).replace(/'/g, "''")}'&$select=id,subject,receivedDateTime,from`
    );
    return Array.isArray(data?.value) ? data.value : [];
  }

  async registerNotifications(webhookUrl) {
    const mailbox = this.integration.mailboxAddress;
    const clientState = this.integration.clientStateToken || crypto.randomBytes(24).toString('hex');
    // Max Graph mail subscription lifetime is ~4230 minutes (< 3 days)
    const expirationDateTime = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();

    const sub = await this.graphRequest('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        changeType: 'created',
        notificationUrl: webhookUrl,
        lifecycleNotificationUrl: webhookUrl,
        resource: `users/${mailbox}/mailFolders('Inbox')/messages`,
        expirationDateTime,
        clientState,
      }),
    });

    this.integration.subscriptionId = sub.id;
    this.integration.subscriptionExpiration = new Date(sub.expirationDateTime);
    this.integration.clientStateToken = clientState;
    await this.integration.save();
    return { subscriptionId: sub.id, expirationDateTime: sub.expirationDateTime };
  }

  async renewSubscription() {
    if (!this.integration.subscriptionId) {
      throw new AppError('No active Outlook subscription to renew.', 400);
    }
    const expirationDateTime = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
    const sub = await this.graphRequest(`/subscriptions/${encodeURIComponent(this.integration.subscriptionId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ expirationDateTime }),
    });
    this.integration.subscriptionExpiration = new Date(sub.expirationDateTime);
    await this.integration.save();
    return { subscriptionId: sub.id, expirationDateTime: sub.expirationDateTime };
  }

  async syncMissedMessages() {
    const since = this.integration.lastSyncedAt
      ? new Date(this.integration.lastSyncedAt.getTime() - 5 * 60 * 1000)
      : new Date(Date.now() - 24 * 3600 * 1000);
    return this.fetchMessages({ since, maxResults: 30 });
  }

  async disconnect() {
    if (this.integration.subscriptionId) {
      await this.graphRequest(`/subscriptions/${encodeURIComponent(this.integration.subscriptionId)}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
    await this.saveCredentials(
      { accessToken: '', refreshToken: '', clientSecret: '' },
      {
        connectionStatus: 'Disconnected',
        subscriptionId: '',
        subscriptionExpiration: null,
        hasClientSecret: false,
        hasOAuthTokens: false,
      }
    );
    return { disconnected: true };
  }

  async sendReply({ to, subject, body, conversationId, inReplyTo }) {
    const mailbox = encodeURIComponent(this.integration.mailboxAddress);
    await this.graphRequest(`/users/${mailbox}/sendMail`, {
      method: 'POST',
      body: JSON.stringify({
        message: {
          subject: subject?.startsWith('Re:') ? subject : `Re: ${subject}`,
          body: { contentType: 'Text', content: body },
          toRecipients: (Array.isArray(to) ? to : [to]).map((addr) => ({ emailAddress: { address: addr } })),
          ...(conversationId ? { conversationId } : {}),
          ...(inReplyTo
            ? { internetMessageHeaders: [{ name: 'In-Reply-To', value: inReplyTo }] }
            : {}),
        },
        saveToSentItems: true,
      }),
    });
    return { sent: true };
  }

  #normalizeGraphMessage(msg, attachments = []) {
    const headers = Array.isArray(msg.internetMessageHeaders) ? msg.internetMessageHeaders : [];
    const headerVal = (name) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
    const refs = headerVal('References')
      .split(/\s+/)
      .map((r) => r.trim())
      .filter(Boolean);

    const isHtml = msg.body?.contentType?.toLowerCase() === 'html';
    const rawBody = msg.body?.content || '';
    const plainBody = isHtml
      ? rawBody.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim() || msg.bodyPreview || ''
      : rawBody || msg.bodyPreview || '';

    return this.normalizeMessage({
      providerMessageId: msg.id,
      internetMessageId: msg.internetMessageId || headerVal('Message-ID'),
      conversationId: msg.conversationId,
      inReplyTo: headerVal('In-Reply-To'),
      references: refs,
      sender: {
        name: msg.from?.emailAddress?.name || '',
        email: msg.from?.emailAddress?.address || '',
      },
      recipients: (msg.toRecipients || []).map((r) => r.emailAddress?.address).filter(Boolean),
      cc: (msg.ccRecipients || []).map((r) => r.emailAddress?.address).filter(Boolean),
      bcc: (msg.bccRecipients || []).map((r) => r.emailAddress?.address).filter(Boolean),
      subject: msg.subject || '(No Subject)',
      plainBody,
      htmlBody: isHtml ? rawBody : '',
      receivedAt: msg.receivedDateTime,
      attachments,
      rawMetadata: {
        autoSubmitted: headerVal('Auto-Submitted'),
        xAutoreply: headerVal('X-Autoreply'),
      },
      providerMetadata: { graphId: msg.id },
    });
  }
}

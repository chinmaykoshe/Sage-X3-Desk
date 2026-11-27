import BaseEmailProvider from './BaseEmailProvider.js';
import AppError from '../../utils/AppError.js';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

function decodeBase64Url(str = '') {
  if (!str) return '';
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64').toString('utf8');
}

function decodeBase64UrlBuffer(str = '') {
  if (!str) return Buffer.alloc(0);
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

/**
 * Gmail / Google Workspace provider using Gmail API v1 + Google OAuth 2.0 + Pub/Sub watch.
 */
export default class GmailProvider extends BaseEmailProvider {
  static buildAuthUrl({ clientId, redirectUri, state }) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: state || '',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeAuthCode({ code, redirectUri }) {
    const clientId = this.integration.publicConfig?.clientId || this.credentials.clientId;
    const clientSecret = this.credentials.clientSecret;
    if (!clientId || !clientSecret) {
      throw new AppError('Gmail OAuth Client ID and Client Secret are required.', 400);
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      const detail = [data.error, data.error_description].filter(Boolean).join(': ') || `HTTP ${res.status}`;
      throw new AppError(`Gmail OAuth exchange failed (${detail})`, 400);
    }

    const tokenExpiry = new Date(Date.now() + Number(data.expires_in || 3600) * 1000).toISOString();
    await this.saveCredentials(
      {
        accessToken: data.access_token,
        ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
        tokenExpiry,
      },
      {
        connectionStatus: 'Connected',
        lastError: '',
        grantedScopes: String(data.scope || '').split(/\s+/).filter(Boolean),
      }
    );
    return data;
  }

  async authenticate() {
    const clientId = this.integration.publicConfig?.clientId || this.credentials.clientId;
    const clientSecret = this.credentials.clientSecret;
    const refreshToken = this.credentials.refreshToken;

    if (
      this.credentials.accessToken &&
      this.credentials.tokenExpiry &&
      new Date(this.credentials.tokenExpiry).getTime() > Date.now() + 120000
    ) {
      return this.credentials.accessToken;
    }

    if (!clientId || !clientSecret || !refreshToken) {
      throw new AppError('Gmail is not authorized yet. Click "Authorize Google" or provide a valid Refresh Token.', 400);
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      const detail = [data.error, data.error_description].filter(Boolean).join(': ') || `HTTP ${res.status}`;
      const hint =
        data.error === 'invalid_grant'
          ? ' — Refresh token is invalid or expired. Click "Authorize Google" to connect your Gmail account.'
          : '';
      throw new AppError(`Gmail token refresh failed (${detail})${hint}`, 400);
    }

    const tokenExpiry = new Date(Date.now() + Number(data.expires_in || 3600) * 1000).toISOString();
    await this.saveCredentials(
      { accessToken: data.access_token, tokenExpiry },
      { connectionStatus: 'Connected', lastError: '' }
    );
    return data.access_token;
  }

  async gmailRequest(path, options = {}) {
    const token = await this.authenticate();
    const res = await fetch(`${GMAIL_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error?.message || `Gmail API error (HTTP ${res.status})`;
      const mappedStatus = res.status === 401 || res.status === 403 ? 400 : res.status >= 400 && res.status < 500 ? res.status : 502;
      throw new AppError(msg, mappedStatus);
    }
    return data;
  }

  async testConnection() {
    const profile = await this.gmailRequest('/profile');
    if (profile.historyId && !this.integration.lastHistoryId) {
      this.integration.lastHistoryId = String(profile.historyId);
      await this.integration.save();
    }
    return {
      ok: true,
      provider: 'gmail',
      mailbox: profile.emailAddress || this.integration.mailboxAddress,
      messagesTotal: profile.messagesTotal ?? 0,
      historyId: profile.historyId,
    };
  }

  async fetchMessages({ maxResults = 20, q = 'in:inbox' } = {}) {
    const listData = await this.gmailRequest(`/messages?maxResults=${maxResults}&q=${encodeURIComponent(q)}`);
    const items = Array.isArray(listData?.messages) ? listData.messages : [];
    const normalized = [];
    for (const item of items) {
      normalized.push(await this.getMessageDetails(item.id));
    }
    return normalized;
  }

  async getMessageDetails(providerMessageId) {
    const msg = await this.gmailRequest(`/messages/${encodeURIComponent(providerMessageId)}?format=full`);
    const attachments = await this.getAttachments(providerMessageId, msg);
    return this.#normalizeGmailMessage(msg, attachments);
  }

  async getAttachments(providerMessageId, preloadedMsg = null) {
    const msg = preloadedMsg || (await this.gmailRequest(`/messages/${encodeURIComponent(providerMessageId)}?format=full`));
    const parts = [];
    const walk = (node) => {
      if (!node) return;
      if (node.filename && node.body?.attachmentId) {
        parts.push(node);
      }
      if (Array.isArray(node.parts)) node.parts.forEach(walk);
    };
    walk(msg.payload);

    const results = [];
    for (const part of parts) {
      const att = await this.gmailRequest(
        `/messages/${encodeURIComponent(providerMessageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`
      );
      results.push({
        providerAttachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: Number(att.size || part.body.size || 0),
        buffer: decodeBase64UrlBuffer(att.data || ''),
      });
    }
    return results;
  }

  async getThreadInfo(threadId) {
    const data = await this.gmailRequest(`/threads/${encodeURIComponent(threadId)}?format=metadata`);
    return Array.isArray(data?.messages) ? data.messages : [];
  }

  async registerNotifications() {
    const topicName = this.integration.publicConfig?.pubsubTopic;
    if (!topicName) {
      throw new AppError('Google Cloud Pub/Sub topic is required to register Gmail watch.', 400);
    }
    const watch = await this.gmailRequest('/watch', {
      method: 'POST',
      body: JSON.stringify({
        topicName,
        labelIds: ['INBOX'],
      }),
    });
    this.integration.lastHistoryId = String(watch.historyId || this.integration.lastHistoryId || '');
    this.integration.subscriptionId = topicName;
    this.integration.subscriptionExpiration = watch.expiration ? new Date(Number(watch.expiration)) : new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await this.integration.save();
    return { historyId: watch.historyId, expiration: this.integration.subscriptionExpiration };
  }

  async renewSubscription() {
    return this.registerNotifications();
  }

  async syncMissedMessages() {
    const startHistoryId = this.integration.lastHistoryId;
    if (!startHistoryId) {
      const msgs = await this.fetchMessages({ maxResults: 20 });
      const profile = await this.gmailRequest('/profile').catch(() => null);
      if (profile?.historyId) {
        this.integration.lastHistoryId = String(profile.historyId);
        await this.integration.save();
      }
      return msgs;
    }

    try {
      const hist = await this.gmailRequest(
        `/history?startHistoryId=${encodeURIComponent(startHistoryId)}&historyTypes=messageAdded`
      );
      const ids = new Set();
      for (const h of hist.history || []) {
        for (const added of h.messagesAdded || []) {
          if (added.message?.id) ids.add(added.message.id);
        }
      }
      if (hist.historyId) {
        this.integration.lastHistoryId = String(hist.historyId);
        await this.integration.save();
      }
      const normalized = [];
      for (const id of ids) {
        normalized.push(await this.getMessageDetails(id));
      }
      return normalized;
    } catch (err) {
      // Safe resynchronization when Gmail historyId expires (HTTP 404)
      if (err.statusCode === 404) {
        const msgs = await this.fetchMessages({ maxResults: 20 });
        const profile = await this.gmailRequest('/profile').catch(() => null);
        if (profile?.historyId) {
          this.integration.lastHistoryId = String(profile.historyId);
          await this.integration.save();
        }
        return msgs;
      }
      throw err;
    }
  }

  async disconnect() {
    await this.gmailRequest('/stop', { method: 'POST' }).catch(() => {});
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
    const toLine = (Array.isArray(to) ? to : [to]).join(', ');
    const subj = subject?.startsWith('Re:') ? subject : `Re: ${subject}`;
    const rawLines = [
      `To: ${toLine}`,
      `Subject: ${subj}`,
      ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body,
    ].join('\r\n');
    const raw = Buffer.from(rawLines, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await this.gmailRequest('/messages/send', {
      method: 'POST',
      body: JSON.stringify({ raw, ...(conversationId ? { threadId: conversationId } : {}) }),
    });
    return { sent: true };
  }

  #normalizeGmailMessage(msg, attachments = []) {
    const headers = msg.payload?.headers || [];
    const headerVal = (name) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    const parseEmailAddr = (raw = '') => {
      const m = raw.match(/^(.*?)\s*<([^>]+)>$/);
      if (m) return { name: m[1].replace(/^['"]|['"]$/g, '').trim(), email: m[2].trim().toLowerCase() };
      return { name: '', email: raw.trim().toLowerCase() };
    };
    const splitAddrs = (raw = '') =>
      raw
        .split(',')
        .map((s) => parseEmailAddr(s).email)
        .filter(Boolean);

    let plainBody = '';
    let htmlBody = '';
    const extractBodies = (node) => {
      if (!node) return;
      if (node.mimeType === 'text/plain' && node.body?.data && !plainBody) {
        plainBody = decodeBase64Url(node.body.data);
      } else if (node.mimeType === 'text/html' && node.body?.data && !htmlBody) {
        htmlBody = decodeBase64Url(node.body.data);
      }
      if (Array.isArray(node.parts)) node.parts.forEach(extractBodies);
    };
    extractBodies(msg.payload);
    if (!plainBody && htmlBody) {
      plainBody = htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
    }

    const refs = headerVal('References')
      .split(/\s+/)
      .map((r) => r.trim())
      .filter(Boolean);

    return this.normalizeMessage({
      providerMessageId: msg.id,
      internetMessageId: headerVal('Message-ID') || headerVal('Message-Id'),
      conversationId: msg.threadId,
      inReplyTo: headerVal('In-Reply-To'),
      references: refs,
      sender: parseEmailAddr(headerVal('From')),
      recipients: splitAddrs(headerVal('To')),
      cc: splitAddrs(headerVal('Cc')),
      bcc: splitAddrs(headerVal('Bcc')),
      subject: headerVal('Subject') || '(No Subject)',
      plainBody: plainBody || msg.snippet || '',
      htmlBody,
      receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
      attachments,
      rawMetadata: {
        autoSubmitted: headerVal('Auto-Submitted'),
        xAutoreply: headerVal('X-Autoreply'),
        labelIds: msg.labelIds || [],
      },
      providerMetadata: { gmailId: msg.id, threadId: msg.threadId, historyId: msg.historyId },
    });
  }
}
